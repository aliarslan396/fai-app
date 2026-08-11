"use client"

import { useState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import type { Ncr } from "@/lib/ncrs"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  ncr: Ncr
  onDone?: (ncr: Ncr) => void
}

/**
 * First half of the two-sign-off close-out per doc 3.10.
 * Records that corrective action was performed. A DIFFERENT user
 * must then close the NCR (enforced server-side).
 */
export function VerifyNcrDialog({ open, onOpenChange, ncr, onDone }: Props) {
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (notes.trim().length < 3) {
      toast.error("Verification notes required (min 3 chars).")
      return
    }
    setSubmitting(true)
    try {
      const { data } = await api.post<{ ncr: Ncr }>(`/ncrs/${ncr.id}/verify`, {
        notes: notes.trim(),
      })
      toast.success(`${ncr.ncr_number} verified — awaiting QA closure`)
      onDone?.(data.ncr)
      setNotes("")
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to verify"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Verify {ncr.ncr_number}
          </DialogTitle>
          <DialogDescription>
            First sign-off — confirm the disposition action was carried out. A different
            user must then close the NCR (aerospace two-signature rule).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="verify-notes">
              Verification notes <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="verify-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Corrective action performed, parts reworked/scrapped, evidence attached, etc."
              disabled={submitting}
              required
              minLength={3}
            />
            <p className="text-xs text-muted-foreground">
              Your name + timestamp will be recorded on the NCR.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Verify Action
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
