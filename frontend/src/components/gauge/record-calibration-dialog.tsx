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
import type { CalResult, Gauge } from "@/lib/gauges"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  gauge: Gauge
  onDone?: () => void
}

export function RecordCalibrationDialog({ open, onOpenChange, gauge, onDone }: Props) {
  const [calibratedAt, setCalibratedAt] = useState(new Date().toISOString().slice(0, 10))
  const [calibratedBy, setCalibratedBy] = useState("")
  const [certNumber, setCertNumber] = useState("")
  const [asFound, setAsFound] = useState("")
  const [asLeft, setAsLeft] = useState("")
  const [result, setResult] = useState<CalResult>("pass")
  const [notes, setNotes] = useState("")
  const [certFile, setCertFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setCalibratedAt(new Date().toISOString().slice(0, 10))
    setCalibratedBy("")
    setCertNumber("")
    setAsFound("")
    setAsLeft("")
    setResult("pass")
    setNotes("")
    setCertFile(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const form = new FormData()
      form.append("calibrated_at", calibratedAt)
      form.append("calibrated_by", calibratedBy)
      form.append("result", result)
      if (certNumber) form.append("cert_number", certNumber)
      if (asFound) form.append("as_found", asFound)
      if (asLeft) form.append("as_left", asLeft)
      if (notes) form.append("notes", notes)
      if (certFile) form.append("cert_file", certFile)

      const { data } = await api.post<{ calibration: unknown; gauge: Gauge }>(
        `/gauges/${gauge.id}/calibrations`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      )

      const wasOos = gauge.out_of_service
      const nowOos = data.gauge?.out_of_service ?? true

      if (result === "fail_oot") {
        toast.warning(`${gauge.gauge_id} calibration logged · gauge is now Out of Service`)
      } else if (wasOos && !nowOos) {
        toast.success(`${gauge.gauge_id} calibration logged · gauge returned to Current`)
      } else if (wasOos && nowOos) {
        toast.info(`${gauge.gauge_id} calibration logged · Out of Service stays (clear it manually if fixed)`)
      } else {
        toast.success(`Calibration logged for ${gauge.gauge_id}`)
      }

      onDone?.()
      reset()
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to record calibration"))
    } finally {
      setSubmitting(false)
    }
  }

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
            <ClipboardCheck className="h-4 w-4" />
            Record Calibration — {gauge.gauge_id}
          </DialogTitle>
          <DialogDescription>
            Log calibration event. Updates gauge status and next-due date automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cal-date">Calibrated On</Label>
              <Input id="cal-date" type="date" value={calibratedAt} onChange={(e) => setCalibratedAt(e.target.value)} disabled={submitting} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cal-by">Calibrated By *</Label>
              <Input id="cal-by" value={calibratedBy} onChange={(e) => setCalibratedBy(e.target.value)} placeholder="ABC Cal Services" disabled={submitting} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cal-cert">Cert Number</Label>
              <Input id="cal-cert" value={certNumber} onChange={(e) => setCertNumber(e.target.value)} placeholder="ABC-2026-1042" disabled={submitting} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cal-res">Result *</Label>
              <Select value={result} onValueChange={(v) => setResult(v as CalResult)} disabled={submitting}>
                <SelectTrigger id="cal-res" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="limited_use">Limited Use</SelectItem>
                  <SelectItem value="fail_oot">Fail (Out of Tolerance)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="as-found">As Found</Label>
            <Textarea id="as-found" rows={2} value={asFound} onChange={(e) => setAsFound(e.target.value)} placeholder="Readings before adjustment" disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="as-left">As Left</Label>
            <Textarea id="as-left" rows={2} value={asLeft} onChange={(e) => setAsLeft(e.target.value)} placeholder="Readings after adjustment" disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cal-notes">Notes</Label>
            <Textarea id="cal-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cal-file">Cert PDF (optional, max 10MB)</Label>
            <Input id="cal-file" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} disabled={submitting} />
          </div>

          {result === "fail_oot" && (
            <div className="rounded-md border border-red-200 bg-red-50/60 p-3 text-xs text-red-800">
              ⚠ Failed calibration will automatically pull this gauge out of service.
            </div>
          )}

          {result === "pass" && gauge.out_of_service && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800">
              ✓ This gauge is currently Out of Service. A Pass result will automatically
              return it to service <em>if</em> the Out of Service was caused by a failed cal.
              A physical-damage flag stays until you clear it manually.
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !calibratedBy}>
              {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save Calibration
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
