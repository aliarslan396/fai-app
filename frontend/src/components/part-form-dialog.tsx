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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

export interface Part {
  id: number
  part_number: string
  revision: string
  description: string
  customer_id: number | null
  customer?: { id: number; name: string; code: string | null } | null
  material: string | null
  process: string | null
  classification: "critical" | "major" | "minor" | null
  status: "active" | "obsolete" | "hold"
  notes: string | null
  drawings_count?: number
  created_at: string
}

interface Customer {
  id: number
  name: string
  code: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  part?: Part | null
  onSaved: () => void
}

const EMPTY = {
  part_number: "",
  revision: "-",
  description: "",
  customer_id: "" as string,
  material: "",
  process: "",
  classification: "" as string,
  status: "active" as "active" | "obsolete" | "hold",
  notes: "",
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

export function PartFormDialog({ open, onOpenChange, part, onSaved }: Props) {
  const isEdit = !!part
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])

  useEffect(() => {
    if (!open) return
    api
      .get("/customers", { params: { per_page: 200, status: "active" } })
      .then((res) => setCustomers(res.data.data || []))
      .catch(() => setCustomers([]))
  }, [open])

  useEffect(() => {
    if (part) {
      setForm({
        part_number: part.part_number || "",
        revision: part.revision || "-",
        description: part.description || "",
        customer_id: part.customer_id ? String(part.customer_id) : "",
        material: part.material || "",
        process: part.process || "",
        classification: part.classification || "",
        status: part.status || "active",
        notes: part.notes || "",
      })
    } else {
      setForm(EMPTY)
    }
    setErrors({})
  }, [part, open])

  const update = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K] | string) => {
    setForm((prev) => ({ ...prev, [key]: value as (typeof EMPTY)[K] }))
    if (errors[key as string]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key as string]
        return next
      })
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    if (!form.part_number.trim()) {
      setErrors({ part_number: "Required" })
      return
    }
    if (!form.revision.trim()) {
      setErrors({ revision: "Required" })
      return
    }
    if (!form.description.trim() || form.description.trim().length < 2) {
      setErrors({ description: "At least 2 characters" })
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        part_number: form.part_number.trim(),
        revision: form.revision.trim(),
        description: form.description.trim(),
        status: form.status,
      }
      if (form.customer_id) payload.customer_id = Number(form.customer_id)
      if (form.material.trim()) payload.material = form.material.trim()
      if (form.process.trim()) payload.process = form.process.trim()
      if (form.classification) payload.classification = form.classification
      if (form.notes.trim()) payload.notes = form.notes.trim()

      if (isEdit && part) {
        await api.patch(`/parts/${part.id}`, payload)
        toast.success("Part updated")
      } else {
        await api.post("/parts", payload)
        toast.success("Part added")
      }

      onSaved()
      onOpenChange(false)
    } catch (err) {
      const fieldErrors = getFieldErrors(err)
      if (fieldErrors) {
        setErrors(fieldErrors)
      } else {
        toast.error(getErrorMessage(err, "Failed to save part"))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit part" : "Add part"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update part details. Linked drawings + plans stay attached."
              : "A part is a unique combination of part number + revision."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="part_number">
                Part Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="part_number"
                value={form.part_number}
                onChange={(e) => update("part_number", e.target.value)}
                placeholder="GPEMP0100043"
                disabled={saving}
                autoFocus={!isEdit}
              />
              {errors.part_number && (
                <p className="text-sm text-destructive">{errors.part_number}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="revision">
                Revision <span className="text-destructive">*</span>
              </Label>
              <Input
                id="revision"
                value={form.revision}
                onChange={(e) => update("revision", e.target.value)}
                placeholder="A"
                disabled={saving}
              />
              {errors.revision && (
                <p className="text-sm text-destructive">{errors.revision}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              Description <span className="text-destructive">*</span>
            </Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Solar Array Holding Fixture"
              disabled={saving}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer_id">Customer</Label>
              <Select
                value={form.customer_id || "none"}
                onValueChange={(v) => update("customer_id", v === "none" ? "" : v)}
                disabled={saving}
              >
                <SelectTrigger id="customer_id" className="w-full">
                  <SelectValue placeholder="(none)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">(none)</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} {c.code ? `(${c.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => update("status", v as "active" | "obsolete" | "hold")}
                disabled={saving}
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                  <SelectItem value="obsolete">Obsolete</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="material">Material</Label>
              <Input
                id="material"
                value={form.material}
                onChange={(e) => update("material", e.target.value)}
                placeholder="6061-T6 Aluminum"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="process">Process</Label>
              <Input
                id="process"
                value={form.process}
                onChange={(e) => update("process", e.target.value)}
                placeholder="CNC machining"
                disabled={saving}
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="classification">Classification</Label>
              <Select
                value={form.classification || "none"}
                onValueChange={(v) => update("classification", v === "none" ? "" : v)}
                disabled={saving}
              >
                <SelectTrigger id="classification" className="w-full">
                  <SelectValue placeholder="(none)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">(none)</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="major">Major</SelectItem>
                  <SelectItem value="minor">Minor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Internal notes"
                disabled={saving}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save changes" : "Add part"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
