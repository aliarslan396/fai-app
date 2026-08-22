"use client"

import { useState } from "react"
import { toast } from "sonner"
import { AlertOctagon, Loader2 } from "lucide-react"

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
import { getErrorMessage } from "@/lib/errors"
import {
  OOT_DISPOSITION_LABEL,
  apiRecordOot,
  type GaugeCalibration,
  type OotDisposition,
} from "@/lib/gauges"

interface Props {
  gaugeId: number
  calibration: GaugeCalibration
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

/**
 * OOT (Out-Of-Tolerance) impact assessment form. Opens against a
 * specific failed calibration — asks the assessor to describe what
 * work was done with the bad gauge since the last known good cal,
 * their impact analysis, containment, and disposition. Optionally
 * links a related NCR ticket.
 */
export function OotAssessmentDialog({ gaugeId, calibration, open, onOpenChange, onDone }: Props) {
  const [lastGood, setLastGood] = useState("")
  const [partsRisk, setPartsRisk] = useState("")
  const [impact, setImpact] = useState("")
  const [containment, setContainment] = useState("")
  const [disposition, setDisposition] = useState<OotDisposition>("investigate")
  const [ncrId, setNcrId] = useState("")
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setLastGood("")
    setPartsRisk("")
    setImpact("")
    setContainment("")
    setDisposition("investigate")
    setNcrId("")
  }

  async function submit() {
    if (!impact.trim()) {
      toast.error("Impact analysis required")
      return
    }
    setBusy(true)
    try {
      await apiRecordOot(gaugeId, calibration.id, {
        last_known_good_at: lastGood || null,
        parts_at_risk_summary: partsRisk.trim() || null,
        impact_analysis: impact.trim(),
        containment_action: containment.trim() || null,
        ncr_id: ncrId ? Number(ncrId) : null,
        disposition,
      })
      toast.success("OOT assessment logged")
      reset()
      onOpenChange(false)
      onDone()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save assessment"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-red-600" />
            OOT Impact Assessment
          </DialogTitle>
          <DialogDescription>
            Failing calibration on {new Date(calibration.calibrated_at).toLocaleDateString()}
            {calibration.cert_number && ` · cert ${calibration.cert_number}`}. Document what work
            was done with this gauge since the last good cal and how you&apos;re handling it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Last Known Good Calibration Date</Label>
            <Input type="date" value={lastGood} onChange={(e) => setLastGood(e.target.value)} disabled={busy} />
          </div>

          <div className="space-y-1">
            <Label>Parts at Risk (summary)</Label>
            <Textarea
              rows={2}
              placeholder="Which part numbers / lots / jobs used this gauge in the window?"
              value={partsRisk}
              onChange={(e) => setPartsRisk(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-1">
            <Label>
              Impact Analysis <span className="text-red-600">*</span>
            </Label>
            <Textarea
              rows={4}
              placeholder="What's the actual risk to product? Reasoning + magnitude of error vs tolerance..."
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-1">
            <Label>Containment Action</Label>
            <Textarea
              rows={2}
              placeholder="Quarantine holds, customer notifications, re-inspections planned..."
              value={containment}
              onChange={(e) => setContainment(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Disposition</Label>
              <Select value={disposition} onValueChange={(v) => setDisposition(v as OotDisposition)}>
                <SelectTrigger disabled={busy}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(OOT_DISPOSITION_LABEL) as OotDisposition[]).map((d) => (
                    <SelectItem key={d} value={d}>
                      {OOT_DISPOSITION_LABEL[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Related NCR # (optional)</Label>
              <Input
                type="number"
                placeholder="Existing NCR id, if any"
                value={ncrId}
                onChange={(e) => setNcrId(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving
              </>
            ) : (
              "Log Assessment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
