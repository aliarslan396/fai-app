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
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  partId: number
  plan?: InspectionPlan | null
  onSaved: (plan: InspectionPlan) => void
}

const EMPTY = { plan_name: "", status: "draft" as const }

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
  const [form, setForm] = useState<{ plan_name: string; status: "draft" | "active" | "superseded" }>(
    EMPTY
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (plan) {
      setForm({ plan_name: plan.plan_name, status: plan.status })
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

    setSaving(true)
    try {
      const payload = { ...form, part_id: partId }
      const { data } = isEdit && plan
        ? await api.patch(`/plans/${plan.id}`, { plan_name: form.plan_name, status: form.status })
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
      <DialogContent>
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
                setForm((f) => ({ ...f, status: v as "draft" | "active" | "superseded" }))
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
