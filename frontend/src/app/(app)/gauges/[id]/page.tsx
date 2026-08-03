"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Wrench,
  Loader2,
  ClipboardCheck,
  Download,
  AlertTriangle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RecordCalibrationDialog } from "@/components/gauge/record-calibration-dialog"
import { useAuthStore } from "@/lib/auth-store"
import {
  RESULT_COLOR,
  RESULT_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  useGauge,
} from "@/lib/gauges"

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  } catch {
    return iso
  }
}

export default function GaugeDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { hasPermission } = useAuthStore()
  const canCalibrate = hasPermission("gauges.calibrate")

  const id = Number(params.id)
  const { gauge, loading, error, refetch } = useGauge(Number.isFinite(id) ? id : null)

  const [calibrateOpen, setCalibrateOpen] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading gauge…
      </div>
    )
  }

  if (error || !gauge) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/gauges")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Gauges
        </Button>
        <div className="rounded border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {error ?? "Gauge not found."}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/gauges")} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Gauges
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Wrench className="h-6 w-6 text-slate-600" />
            <span className="font-mono">{gauge.gauge_id}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className={STATUS_COLOR[gauge.status]}>
              {STATUS_LABEL[gauge.status]}
            </Badge>
            <span>{gauge.type}</span>
            {gauge.manufacturer && <span>· {gauge.manufacturer}</span>}
            {gauge.model && <span>{gauge.model}</span>}
          </div>
        </div>
        {canCalibrate && !gauge.out_of_service && (
          <Button onClick={() => setCalibrateOpen(true)}>
            <ClipboardCheck className="mr-1 h-4 w-4" />
            Record Calibration
          </Button>
        )}
      </div>

      {gauge.status === "overdue" && (
        <div className="rounded-md border border-red-200 bg-red-50/60 p-3 text-sm text-red-800">
          <AlertTriangle className="mr-1 inline h-4 w-4" />
          This gauge is <strong>overdue</strong>. Do not use for production inspections until recalibrated.
        </div>
      )}

      {gauge.out_of_service && (
        <div className="rounded-md border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800">
          <AlertTriangle className="mr-1 inline h-4 w-4" />
          <strong>Out of Service.</strong> {gauge.out_of_service_reason}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Gauge Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <FieldRow label="Serial #" value={gauge.serial_number} />
            <FieldRow label="Range" value={gauge.range} />
            <FieldRow label="Resolution" value={gauge.resolution} />
            <FieldRow label="Location" value={gauge.location} />
            <Separator />
            <FieldRow label="Cal Interval" value={`${gauge.calibration_interval_months} months`} />
            <FieldRow label="Last Calibrated" value={fmtDate(gauge.last_calibrated_at)} />
            <FieldRow label="Next Due" value={fmtDate(gauge.next_cal_due)} />
            {gauge.days_until_due !== null && !gauge.out_of_service && (
              <FieldRow
                label="Days Until Due"
                value={gauge.days_until_due >= 0 ? `${gauge.days_until_due} days` : `${Math.abs(gauge.days_until_due)} days OVERDUE`}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Calibration History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {gauge.calibrations && gauge.calibrations.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Cert #</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="text-right">Cert File</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gauge.calibrations.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">{fmtDate(c.calibrated_at)}</TableCell>
                      <TableCell className="text-xs">{c.calibrated_by}</TableCell>
                      <TableCell className="font-mono text-xs">{c.cert_number ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={RESULT_COLOR[c.result]}>
                          {RESULT_LABEL[c.result]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.cert_file_path && (
                          <Link
                            href={`/gauges/calibrations/${c.id}/cert`}
                            className="text-xs text-primary hover:underline"
                            target="_blank"
                          >
                            <Download className="mr-1 inline h-3 w-3" />
                            View
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No calibrations recorded yet.
                {canCalibrate && !gauge.out_of_service && (
                  <>
                    <br />
                    <Button variant="link" size="sm" onClick={() => setCalibrateOpen(true)}>
                      Record first calibration →
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RecordCalibrationDialog
        open={calibrateOpen}
        onOpenChange={setCalibrateOpen}
        gauge={gauge}
        onDone={() => void refetch()}
      />
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-3 items-baseline gap-2">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="col-span-2 font-mono text-sm">{value ?? "—"}</div>
    </div>
  )
}
