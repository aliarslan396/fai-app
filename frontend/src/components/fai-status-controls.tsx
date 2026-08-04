"use client"

import { useState } from "react"
import { AlertTriangle, Send, XCircle, RotateCcw, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"

export type FaiStatus = "in_work" | "submitted" | "returned" | "accepted"

export const STATUS_LABEL: Record<FaiStatus, string> = {
  in_work: "In Work",
  submitted: "Submitted for Review",
  returned: "Returned for Rework",
  accepted: "Accepted",
}

export const STATUS_COLOR: Record<FaiStatus, string> = {
  in_work: "bg-slate-100 text-slate-700 border-slate-300",
  submitted: "bg-blue-100 text-blue-800 border-blue-300",
  returned: "bg-amber-100 text-amber-800 border-amber-300",
  accepted: "bg-emerald-100 text-emerald-800 border-emerald-300",
}

interface Props {
  formId: number
  faiNumber: string
  status: FaiStatus | string
  returnedReason?: string | null
  allDone: boolean
  onChanged: () => void
}

/**
 * AS9102 FAI status lifecycle controls per doc 3.4.
 *
 * Status flow:
 *   in_work ──submit──▶ submitted ──return──▶ returned
 *                                 └─sign──▶ accepted
 *   returned ──resubmit──▶ submitted
 *   accepted ──reopen(admin)──▶ in_work
 *
 * Buttons shown depend on current status AND user's role/permissions:
 *   - Inspector (inspections.edit) on in_work/returned: Submit for Review
 *   - QA Manager (inspections.sign) on submitted: Return for Rework
 *     (Accept happens via Sign & Lock button — separate flow)
 *   - Admin (tenant.settings) on accepted: Reopen for Edit
 */
export function FaiStatusControls({ formId, faiNumber, status, returnedReason, allDone, onChanged }: Props) {
  const { hasPermission } = useAuthStore()
  const canSubmit = hasPermission("inspections.edit")
  const canReturn = hasPermission("inspections.sign")
  const canReopen = hasPermission("tenant.settings")

  const [returnOpen, setReturnOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const s = status as FaiStatus

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await api.post(`/fai/${formId}/submit`)
      toast.success(`${faiNumber} submitted for QA review`)
      onChanged()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to submit"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={STATUS_COLOR[s] ?? STATUS_COLOR.in_work}>
          {STATUS_LABEL[s] ?? s}
        </Badge>

        {(s === "in_work" || s === "returned") && canSubmit && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleSubmit}
            disabled={submitting || !allDone}
            title={!allDone ? "Measure all rows before submitting" : ""}
          >
            {submitting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
            {s === "returned" ? "Resubmit" : "Submit for Review"}
          </Button>
        )}

        {s === "submitted" && canReturn && (
          <Button size="sm" variant="outline" onClick={() => setReturnOpen(true)} disabled={submitting}>
            <XCircle className="mr-1 h-3.5 w-3.5" />
            Return for Rework
          </Button>
        )}

        {s === "accepted" && canReopen && (
          <Button size="sm" variant="outline" onClick={() => setReopenOpen(true)} disabled={submitting}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Reopen for Edit
          </Button>
        )}
      </div>

      {s === "returned" && returnedReason && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50/70 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900">Returned by QA Manager</p>
              <p className="mt-1 text-xs text-amber-800">{returnedReason}</p>
            </div>
          </div>
        </div>
      )}

      <ReasonDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        title={`Return ${faiNumber} for Rework`}
        description="Written reason will be displayed to the originating inspector so they know what to fix."
        confirmLabel="Return"
        endpoint={`/fai/${formId}/return`}
        onDone={() => {
          toast.success(`${faiNumber} returned for rework`)
          onChanged()
        }}
      />

      <ReasonDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title={`Reopen ${faiNumber} for Edit`}
        description="Admin-only formal reopen of an accepted (locked) form. Reason is required for the audit trail — every reopen creates a permanent record."
        confirmLabel="Reopen"
        endpoint={`/fai/${formId}/reopen`}
        onDone={() => {
          toast.success(`${faiNumber} reopened for editing`)
          onChanged()
        }}
      />
    </>
  )
}

interface ReasonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  endpoint: string
  onDone: () => void
}

function ReasonDialog({ open, onOpenChange, title, description, confirmLabel, endpoint, onDone }: ReasonDialogProps) {
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await api.post(endpoint, { reason })
      onDone()
      setReason("")
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return
        if (!next) setReason("")
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reason">Reason *</Label>
          <Textarea
            id="reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain what needs to change or why…"
            disabled={submitting}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting || reason.trim().length < 5}>
            {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
