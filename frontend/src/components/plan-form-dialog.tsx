"use client"

import { useEffect, useState } from "react"
import type { AxiosError } from "axios"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

export interface InspectionPlan {
  id: number
  plan_number: string
  plan_name: string
  part_id: number
  status: "draft" | "active" | "superseded"
  balloon_count: number
  characteristic_count: number
  documents_count?: number
  balloons_count?: number
  characteristics_count?: number
  created_at: string
  tol_1dp?: number | string
  tol_2dp?: number | string
  tol_3dp?: number | string
  tol_angular?: number | string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  partId: number
  plan?: InspectionPlan | null
  onSaved: (plan: InspectionPlan) => void
}

const EMPTY = {
  plan_name: "",
  status: "draft" as const,
  tol_1dp: "0.030",
  tol_2dp: "0.010",
  tol_3dp: "0.005",
  tol_angular: "0.5",
}

function getFieldErrors(err: unknown): Record<string, string> | null {
  const axiosErr = err as AxiosError<{ errors?: Record<string, string[]> }>
  const errors = axiosErr.response?.data?.errors
  if (!errors) return null
  const out: Record<string, string> = {}
  for (const [field, messages] of Object.entries(errors)) {
    if (messages?.[0]) out[field] = messages[0]
  }
  return Object.keys(out).length > 0 ? out : null
}

export function PlanFormDialog({ open, onOpenChange, partId, plan, onSaved }: Props) {
  const isEdit = !!plan
  const [form, setForm] = useState<typeof EMPTY>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (plan) {
      setForm({
        plan_name: plan.plan_name,
        status: plan.status as typeof EMPTY.status,
        tol_1dp: String(plan.tol_1dp ?? "0.030"),
        tol_2dp: String(plan.tol_2dp ?? "0.010"),
        tol_3dp: String(plan.tol_3dp ?? "0.005"),
        tol_angular: String(plan.tol_angular ?? "0.5"),
      })
    } else {
      setForm(EMPTY)
    }
    setErrors({})
  }, [plan, open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    if (!form.plan_name.trim() || form.plan_name.trim().length < 2) {
      setErrors({ plan_name: "At least 2 characters" })
      return
    }

    const tolFields = ["tol_1dp", "tol_2dp", "tol_3dp", "tol_angular"] as const
    for (const k of tolFields) {
      const v = parseFloat(form[k])
      if (isNaN(v) || v < 0) {
        setErrors({ [k]: "Must be a positive number" })
        return
      }
    }

    setSaving(true)
    try {
      const tolPayload = {
        tol_1dp: parseFloat(form.tol_1dp),
        tol_2dp: parseFloat(form.tol_2dp),
        tol_3dp: parseFloat(form.tol_3dp),
        tol_angular: parseFloat(form.tol_angular),
      }
      const payload = isEdit && plan
        ? { plan_name: form.plan_name, status: form.status, ...tolPayload }
        : { plan_name: form.plan_name, status: form.status, part_id: partId, ...tolPayload }
      const { data } = isEdit && plan
        ? await api.patch(`/plans/${plan.id}`, payload)
        : await api.post("/plans", payload)

      toast.success(isEdit ? "Plan updated" : `Plan ${data.plan.plan_number} created`)
      onSaved(data.plan)
      onOpenChange(false)
    } catch (err) {
      const fieldErrors = getFieldErrors(err)
      if (fieldErrors) {
        setErrors(fieldErrors)
      } else {
        toast.error(getErrorMessage(err, "Failed to save plan"))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit inspection plan" : "New inspection plan"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update plan details. Plan number stays the same."
              : "Plan number will be auto-generated (IP-YYYY-NNNN)."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan_name">
              Plan name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="plan_name"
              value={form.plan_name}
              onChange={(e) => setForm((f) => ({ ...f, plan_name: e.target.value }))}
              placeholder="Initial Inspection Plan"
              disabled={saving}
              autoFocus
            />
            {errors.plan_name && <p className="text-sm text-destructive">{errors.plan_name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, status: v as typeof EMPTY.status }))
              }
              disabled={saving}
            >
              <SelectTrigger id="status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="superseded">Superseded</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Block tolerance — from drawing's "unless otherwise specified" corner box */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div>
              <h4 className="text-sm font-semibold">Block tolerance</h4>
              <p className="text-xs text-muted-foreground">
                Copy from the drawing&apos;s &quot;unless otherwise specified&quot; box.
                Used as the default for every bubble on this plan.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tol_1dp" className="text-xs">
                  .X (1 decimal) ±
                </Label>
                <Input
                  id="tol_1dp"
                  type="number"
                  step="0.001"
                  min="0"
                  value={form.tol_1dp}
                  onChange={(e) => setForm((f) => ({ ...f, tol_1dp: e.target.value }))}
                  disabled={saving}
                />
                {errors.tol_1dp && <p className="text-xs text-destructive">{errors.tol_1dp}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tol_2dp" className="text-xs">
                  .XX (2 decimal) ±
                </Label>
                <Input
                  id="tol_2dp"
                  type="number"
                  step="0.001"
                  min="0"
                  value={form.tol_2dp}
                  onChange={(e) => setForm((f) => ({ ...f, tol_2dp: e.target.value }))}
                  disabled={saving}
                />
                {errors.tol_2dp && <p className="text-xs text-destructive">{errors.tol_2dp}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tol_3dp" className="text-xs">
                  .XXX (3 decimal) ±
                </Label>
                <Input
                  id="tol_3dp"
                  type="number"
                  step="0.001"
                  min="0"
                  value={form.tol_3dp}
                  onChange={(e) => setForm((f) => ({ ...f, tol_3dp: e.target.value }))}
                  disabled={saving}
                />
                {errors.tol_3dp && <p className="text-xs text-destructive">{errors.tol_3dp}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tol_angular" className="text-xs">
                  Angular ± (degrees)
                </Label>
                <Input
                  id="tol_angular"
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.tol_angular}
                  onChange={(e) => setForm((f) => ({ ...f, tol_angular: e.target.value }))}
                  disabled={saving}
                />
                {errors.tol_angular && <p className="text-xs text-destructive">{errors.tol_angular}</p>}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save" : "Create plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
