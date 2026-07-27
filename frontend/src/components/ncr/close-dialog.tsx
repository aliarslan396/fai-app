"use client"

import { useState } from "react"
import { Loader2, CheckCircle2 } from "lucide-react"
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

export function CloseNcrDialog({ open, onOpenChange, ncr, onDone }: Props) {
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const { data } = await api.post<{ ncr: Ncr }>(`/ncrs/${ncr.id}/close`, {
        closure_notes: notes || null,
      })
      toast.success(`${ncr.ncr_number} closed`)
      onDone?.(data.ncr)
      setNotes("")
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to close"))
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
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Close {ncr.ncr_number}
          </DialogTitle>
          <DialogDescription>
            Confirms the disposition action was carried out and verified. NCR cannot be reopened after closure.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="close-notes">Closure notes (optional)</Label>
            <Textarea
              id="close-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Verification details, sign-off references, corrective actions taken, etc."
              disabled={submitting}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Close NCR
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
