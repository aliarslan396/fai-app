"use client"

import { useEffect, useState } from "react"
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
import type { AxiosError } from "axios"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

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

export interface Customer {
  id: number
  name: string
  code: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  country: string | null
  notes: string | null
  status: "active" | "inactive"
  created_at: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: Customer | null
  onSaved: () => void
}

const EMPTY = {
  name: "",
  code: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  address: "",
  country: "",
  notes: "",
  status: "active" as "active" | "inactive",
}

export function CustomerFormDialog({ open, onOpenChange, customer, onSaved }: Props) {
  const isEdit = !!customer
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name || "",
        code: customer.code || "",
        contact_name: customer.contact_name || "",
        contact_email: customer.contact_email || "",
        contact_phone: customer.contact_phone || "",
        address: customer.address || "",
        country: customer.country || "",
        notes: customer.notes || "",
        status: customer.status || "active",
      })
    } else {
      setForm(EMPTY)
    }
    setErrors({})
  }, [customer, open])

  const update = (key: keyof typeof EMPTY, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    if (!form.name.trim() || form.name.trim().length < 2) {
      setErrors({ name: "Name must be at least 2 characters" })
      return
    }

    setSaving(true)
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v])
      )

      if (isEdit && customer) {
        await api.patch(`/customers/${customer.id}`, payload)
        toast.success("Customer updated")
      } else {
        await api.post("/customers", payload)
        toast.success("Customer added")
      }

      onSaved()
      onOpenChange(false)
    } catch (err) {
      const fieldErrors = getFieldErrors(err)
      if (fieldErrors) {
        setErrors(fieldErrors)
      } else {
        toast.error(getErrorMessage(err, "Failed to save customer"))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit customer" : "Add customer"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update customer details. Changes apply to all linked parts."
              : "Add a new customer (a company that buys parts from you)."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Boeing"
                disabled={saving}
                autoFocus
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => update("code", e.target.value)}
                placeholder="BOE-001"
                disabled={saving}
              />
              {errors.code && <p className="text-sm text-destructive">{errors.code}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => update("status", v)}
                disabled={saving}
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_name">Contact name</Label>
              <Input
                id="contact_name"
                value={form.contact_name}
                onChange={(e) => update("contact_name", e.target.value)}
                placeholder="John Smith"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_email">Contact email</Label>
              <Input
                id="contact_email"
                type="email"
                value={form.contact_email}
                onChange={(e) => update("contact_email", e.target.value)}
                placeholder="john@boeing.com"
                disabled={saving}
              />
              {errors.contact_email && (
                <p className="text-sm text-destructive">{errors.contact_email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_phone">Phone</Label>
              <Input
                id="contact_phone"
                value={form.contact_phone}
                onChange={(e) => update("contact_phone", e.target.value)}
                placeholder="+1 555 123 4567"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={form.country}
                onChange={(e) => update("country", e.target.value)}
                placeholder="USA"
                disabled={saving}
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                placeholder="100 N Riverside Plaza, Chicago, IL 60606"
                disabled={saving}
                rows={2}
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Internal notes (PO terms, contacts, special requirements)"
                disabled={saving}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save changes" : "Add customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
