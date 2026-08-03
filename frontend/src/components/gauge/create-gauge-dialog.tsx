"use client"

import { useState } from "react"
import { Loader2, Wrench } from "lucide-react"
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
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import type { Gauge } from "@/lib/gauges"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (gauge: Gauge) => void
}

export function CreateGaugeDialog({ open, onOpenChange, onCreated }: Props) {
  const [gaugeId, setGaugeId] = useState("")
  const [type, setType] = useState("")
  const [manufacturer, setManufacturer] = useState("")
  const [model, setModel] = useState("")
  const [serialNumber, setSerialNumber] = useState("")
  const [range, setRange] = useState("")
  const [resolution, setResolution] = useState("")
  const [location, setLocation] = useState("")
  const [interval, setInterval] = useState("12")
  const [lastCal, setLastCal] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setGaugeId("")
    setType("")
    setManufacturer("")
    setModel("")
    setSerialNumber("")
    setRange("")
    setResolution("")
    setLocation("")
    setInterval("12")
    setLastCal("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        gauge_id: gaugeId,
        type,
        manufacturer: manufacturer || null,
        model: model || null,
        serial_number: serialNumber || null,
        range: range || null,
        resolution: resolution || null,
        location: location || null,
        calibration_interval_months: Number(interval) || 12,
      }
      if (lastCal) payload.last_calibrated_at = lastCal

      const { data } = await api.post<{ gauge: Gauge }>("/gauges", payload)
      toast.success(`${data.gauge.gauge_id} added`)
      onCreated?.(data.gauge)
      reset()
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to add gauge"))
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Register New Gauge
          </DialogTitle>
          <DialogDescription>
            Enter master data. Calibration events get logged separately from the gauge detail page.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="gid">Gauge ID *</Label>
            <Input id="gid" value={gaugeId} onChange={(e) => setGaugeId(e.target.value)} placeholder="CAL-047" required disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Type *</Label>
            <Input id="type" value={type} onChange={(e) => setType(e.target.value)} placeholder="Caliper, Micrometer, CMM..." required disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mfr">Manufacturer</Label>
            <Input id="mfr" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Mitutoyo" disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mdl">Model</Label>
            <Input id="mdl" value={model} onChange={(e) => setModel(e.target.value)} placeholder='CD-6" ASX' disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sn">Serial #</Label>
            <Input id="sn" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="4471-B" disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="range">Range</Label>
            <Input id="range" value={range} onChange={(e) => setRange(e.target.value)} placeholder="0-6 in" disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="res">Resolution</Label>
            <Input id="res" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="0.0005 in" disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loc">Location</Label>
            <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="QA Lab" disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="int">Cal Interval (months)</Label>
            <Input id="int" type="number" value={interval} onChange={(e) => setInterval(e.target.value)} min={1} max={120} disabled={submitting} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="last">Last Calibrated (optional — set now if known)</Label>
            <Input id="last" type="date" value={lastCal} onChange={(e) => setLastCal(e.target.value)} disabled={submitting} />
          </div>

          <DialogFooter className="col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !gaugeId || !type}>
              {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Add Gauge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
