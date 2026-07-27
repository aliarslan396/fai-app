"use client"

import { useState } from "react"
import { Loader2, ClipboardCheck } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { DISPOSITION_LABEL, type Ncr, type NcrDisposition } from "@/lib/ncrs"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  ncr: Ncr
  onDone?: (ncr: Ncr) => void
}

// Every disposition except `pending` (the initial state, not a valid choice here)
const CHOOSABLE: NcrDisposition[] = [
  "rework",
  "scrap",
  "use_as_is",
  "return_to_vendor",
  "no_defect_found",
]

export function DispositionDialog({ open, onOpenChange, ncr, onDone }: Props) {
  const [disposition, setDisposition] = useState<NcrDisposition>("rework")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const { data } = await api.post<{ ncr: Ncr }>(`/ncrs/${ncr.id}/disposition`, {
        disposition,
        notes: notes || null,
      })
      toast.success(`${ncr.ncr_number} dispositioned as ${DISPOSITION_LABEL[disposition]}`)
      onDone?.(data.ncr)
      setNotes("")
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to disposition"))
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
            <ClipboardCheck className="h-4 w-4" />
            Disposition {ncr.ncr_number}
          </DialogTitle>
          <DialogDescription>
            Decide how this defect will be handled. This step is required before the NCR can be closed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="disp">Disposition</Label>
            <Select
              value={disposition}
              onValueChange={(v) => setDisposition(v as NcrDisposition)}
              disabled={submitting}
            >
              <SelectTrigger id="disp" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHOOSABLE.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DISPOSITION_LABEL[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="disp-notes">Notes (optional)</Label>
            <Textarea
              id="disp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Reasoning, next steps, waiver reference, etc."
              disabled={submitting}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save Disposition
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
