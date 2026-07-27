"use client"

import { useState } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
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
import { SEVERITY_LABEL, type Ncr, type NcrSeverity } from "@/lib/ncrs"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Optional pre-fill from a failed inspection row. When set, dialog
   * shows the failure snapshot up top and the create call includes
   * source_type + source_id so the NCR is linked back to the row.
   */
  prefill?: {
    source_type?: "FaiForm3Row" | "CustomReportCharacteristic"
    source_id?: number
    part_id?: number | null
    inspection_session_id?: number | null
    characteristic_ref?: string | null
    requirement?: string | null
    actual_result?: string | null
    unit?: string | null
  }
  onCreated?: (ncr: Ncr) => void
}

export function CreateNcrDialog({ open, onOpenChange, prefill, onCreated }: Props) {
  const [severity, setSeverity] = useState<NcrSeverity>("major")
  const [cause, setCause] = useState("")
  const [characteristicRef, setCharacteristicRef] = useState(prefill?.characteristic_ref ?? "")
  const [requirement, setRequirement] = useState(prefill?.requirement ?? "")
  const [actualResult, setActualResult] = useState(prefill?.actual_result ?? "")
  const [unit, setUnit] = useState(prefill?.unit ?? "")
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setSeverity("major")
    setCause("")
    setCharacteristicRef(prefill?.characteristic_ref ?? "")
    setRequirement(prefill?.requirement ?? "")
    setActualResult(prefill?.actual_result ?? "")
    setUnit(prefill?.unit ?? "")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        severity,
        cause: cause || null,
        characteristic_ref: characteristicRef || null,
        requirement: requirement || null,
        actual_result: actualResult || null,
        unit: unit || null,
      }
      if (prefill?.source_type) payload.source_type = prefill.source_type
      if (prefill?.source_id) payload.source_id = prefill.source_id
      if (prefill?.part_id) payload.part_id = prefill.part_id
      if (prefill?.inspection_session_id) payload.inspection_session_id = prefill.inspection_session_id

      const { data } = await api.post<{ ncr: Ncr }>("/ncrs", payload)
      toast.success(`${data.ncr.ncr_number} created`)
      onCreated?.(data.ncr)
      reset()
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create NCR"))
    } finally {
      setSubmitting(false)
    }
  }

  const hasSnapshot = !!(prefill?.characteristic_ref || prefill?.requirement || prefill?.actual_result)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Create Non-Conformance Report
          </DialogTitle>
          <DialogDescription>
            Log a defect. An NCR number is auto-assigned. QA Manager will disposition afterwards.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {hasSnapshot && (
            <div className="rounded-md border border-red-200 bg-red-50/60 p-3 text-xs">
              <div className="mb-1 font-medium text-red-800">Failure snapshot (pre-filled)</div>
              <div className="text-red-700">
                Char <span className="font-mono">{prefill?.characteristic_ref}</span> requires{" "}
                <span className="font-mono">{prefill?.requirement}</span>, measured{" "}
                <span className="font-mono">{prefill?.actual_result}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ncr-severity">Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as NcrSeverity)} disabled={submitting}>
              <SelectTrigger id="ncr-severity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SEVERITY_LABEL) as NcrSeverity[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!hasSnapshot && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ncr-char-ref">Char Ref</Label>
                <Input
                  id="ncr-char-ref"
                  value={characteristicRef}
                  onChange={(e) => setCharacteristicRef(e.target.value)}
                  placeholder="5"
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ncr-unit">Unit</Label>
                <Input
                  id="ncr-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="in"
                  disabled={submitting}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="ncr-requirement">Requirement</Label>
                <Input
                  id="ncr-requirement"
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                  placeholder="Ø0.2500 +0.0050/-0.0000 in"
                  disabled={submitting}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="ncr-actual">Actual Result</Label>
                <Input
                  id="ncr-actual"
                  value={actualResult}
                  onChange={(e) => setActualResult(e.target.value)}
                  placeholder="0.2503"
                  disabled={submitting}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ncr-cause">Cause (optional)</Label>
            <Textarea
              id="ncr-cause"
              value={cause}
              onChange={(e) => setCause(e.target.value)}
              rows={3}
              placeholder="What went wrong? Root cause if known."
              disabled={submitting}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Create NCR
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
