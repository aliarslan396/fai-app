"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Wrench,
  Loader2,
  ClipboardCheck,
  FileText,
  AlertTriangle,
  AlertOctagon,
  UserCheck,
  History,
  LogIn,
  LogOut,
  Eye,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RecordCalibrationDialog } from "@/components/gauge/record-calibration-dialog"
import { OotAssessmentDialog } from "@/components/gauge/oot-assessment-dialog"
import { CheckoutDialog } from "@/components/gauge/checkout-dialog"
import { CertViewer } from "@/components/gauge/cert-viewer"
import { useAuthStore } from "@/lib/auth-store"
import { getErrorMessage } from "@/lib/errors"
import {
  OOT_DISPOSITION_LABEL,
  RESULT_COLOR,
  RESULT_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  apiCheckInGauge,
  useGauge,
  type GaugeCalibration,
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

function fmtDateTime(iso: string | null) {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
  } catch {
    return iso
  }
}

export default function GaugeDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { hasPermission } = useAuthStore()
  const canCalibrate = hasPermission("gauges.calibrate")
  const canCheckout = hasPermission("gauges.edit")

  const id = Number(params.id)
  const { gauge, loading, error, refetch } = useGauge(Number.isFinite(id) ? id : null)

  const [calibrateOpen, setCalibrateOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [certOpen, setCertOpen] = useState(false)
  const [certCalId, setCertCalId] = useState<number | null>(null)
  const [ootOpen, setOotOpen] = useState(false)
  const [ootCal, setOotCal] = useState<GaugeCalibration | null>(null)
  const [checkinBusy, setCheckinBusy] = useState(false)

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

  const openViewer = (calId: number) => {
    setCertCalId(calId)
    setCertOpen(true)
  }

  const openOot = (cal: GaugeCalibration) => {
    setOotCal(cal)
    setOotOpen(true)
  }

  async function checkIn() {
    if (!gauge?.open_checkout) return
    setCheckinBusy(true)
    try {
      await apiCheckInGauge(gauge.id, gauge.open_checkout.id)
      toast.success(`${gauge.gauge_id} checked in`)
      refetch()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to check in"))
    } finally {
      setCheckinBusy(false)
    }
  }

  const openCheckout = gauge.open_checkout
  const assessmentByCal = new Map(
    (gauge.oot_assessments ?? []).map((a) => [a.calibration_id, a]),
  )

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/gauges")} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Gauges
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
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
            {openCheckout && (
              <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-800">
                <UserCheck className="mr-1 h-3 w-3" />
                Out with {openCheckout.holder?.name ?? `user #${openCheckout.checked_out_to}`}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCheckout && !gauge.out_of_service && !openCheckout && (
            <Button variant="outline" onClick={() => setCheckoutOpen(true)}>
              <LogOut className="mr-1 h-4 w-4" />
              Check Out
            </Button>
          )}
          {canCheckout && openCheckout && (
            <Button variant="outline" onClick={checkIn} disabled={checkinBusy}>
              {checkinBusy ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-1 h-4 w-4" />
              )}
              Check In
            </Button>
          )}
          {canCalibrate && (
            <Button onClick={() => setCalibrateOpen(true)}>
              <ClipboardCheck className="mr-1 h-4 w-4" />
              Record Calibration
            </Button>
          )}
        </div>
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Gauge Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div className="space-y-2">
            <FieldRow label="Serial #" value={gauge.serial_number} />
            <FieldRow label="Range" value={gauge.range} />
            <FieldRow label="Resolution" value={gauge.resolution} />
            <FieldRow label="Location" value={gauge.location} />
          </div>
          <div className="space-y-2">
            <FieldRow label="Cal Interval" value={`${gauge.calibration_interval_months} months`} />
            <FieldRow label="Last Calibrated" value={fmtDate(gauge.last_calibrated_at)} />
            <FieldRow label="Next Due" value={fmtDate(gauge.next_cal_due)} />
            {gauge.days_until_due !== null && !gauge.out_of_service && (
              <FieldRow
                label="Days Until Due"
                value={
                  gauge.days_until_due >= 0
                    ? `${gauge.days_until_due} days`
                    : `${Math.abs(gauge.days_until_due)} days OVERDUE`
                }
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="cal" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="cal" className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Cal History
          </TabsTrigger>
          <TabsTrigger value="oot" className="flex items-center gap-2">
            <AlertOctagon className="h-4 w-4" /> OOT Assessments
          </TabsTrigger>
          <TabsTrigger value="checkout" className="flex items-center gap-2">
            <History className="h-4 w-4" /> Checkout Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cal">
          <Card>
            <CardContent className="p-0">
              {gauge.calibrations && gauge.calibrations.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Cert #</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Cert</TableHead>
                      <TableHead className="text-right">OOT Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gauge.calibrations.map((c) => {
                      const assessment = assessmentByCal.get(c.id)
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs">{fmtDate(c.calibrated_at)}</TableCell>
                          <TableCell className="text-xs">{c.calibrated_by}</TableCell>
                          <TableCell className="font-mono text-xs">{c.cert_number ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={RESULT_COLOR[c.result]}>
                              {RESULT_LABEL[c.result]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {c.cert_file_path ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => openViewer(c.id)}
                              >
                                <Eye className="mr-1 h-3 w-3" /> View
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {c.result === "fail_oot" &&
                              (assessment ? (
                                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                                  Logged
                                </Badge>
                              ) : canCalibrate ? (
                                <Button size="sm" variant="outline" onClick={() => openOot(c)}>
                                  <AlertOctagon className="mr-1 h-3 w-3" /> Log Assessment
                                </Button>
                              ) : (
                                <span className="text-xs text-amber-800">Assessment needed</span>
                              ))}
                          </TableCell>
                        </TableRow>
                      )
                    })}
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
        </TabsContent>

        <TabsContent value="oot">
          <Card>
            <CardContent className="p-0">
              {gauge.oot_assessments && gauge.oot_assessments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assessed</TableHead>
                      <TableHead>Cal Date</TableHead>
                      <TableHead>Disposition</TableHead>
                      <TableHead>NCR</TableHead>
                      <TableHead>Impact</TableHead>
                      <TableHead>By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gauge.oot_assessments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{fmtDateTime(a.assessed_at)}</TableCell>
                        <TableCell className="text-xs">
                          {a.calibration ? fmtDate(a.calibration.calibrated_at) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800">
                            {OOT_DISPOSITION_LABEL[a.disposition]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {a.ncr ? (
                            <Link href={`/ncr/${a.ncr.id}`} className="font-mono text-xs text-primary hover:underline">
                              {a.ncr.ncr_number}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-md whitespace-pre-wrap text-xs">
                          {a.impact_analysis}
                        </TableCell>
                        <TableCell className="text-xs">{a.assessor?.name ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No OOT assessments logged. They&apos;re only required when a calibration fails.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checkout">
          <Card>
            <CardContent className="p-0">
              {gauge.checkouts && gauge.checkouts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Checked Out</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Job Ref</TableHead>
                      <TableHead>Returned</TableHead>
                      <TableHead>Received By</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gauge.checkouts.map((co) => (
                      <TableRow key={co.id} className={co.checked_in_at ? "" : "bg-blue-50/40"}>
                        <TableCell className="text-xs">{fmtDateTime(co.checked_out_at)}</TableCell>
                        <TableCell className="text-xs">{co.holder?.name ?? `#${co.checked_out_to}`}</TableCell>
                        <TableCell className="font-mono text-xs">{co.job_reference ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {co.checked_in_at ? (
                            fmtDateTime(co.checked_in_at)
                          ) : (
                            <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-800">
                              Open
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{co.returner?.name ?? "—"}</TableCell>
                        <TableCell className="max-w-xs whitespace-pre-wrap text-xs">
                          {co.notes ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No checkout history yet.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RecordCalibrationDialog
        open={calibrateOpen}
        onOpenChange={setCalibrateOpen}
        gauge={gauge}
        onDone={() => void refetch()}
      />

      <CheckoutDialog
        gauge={gauge}
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onDone={() => void refetch()}
      />

      <CertViewer
        open={certOpen}
        onOpenChange={setCertOpen}
        calibrationId={certCalId}
        title={`Cert for ${gauge.gauge_id}`}
      />

      {ootCal && (
        <OotAssessmentDialog
          gaugeId={gauge.id}
          calibration={ootCal}
          open={ootOpen}
          onOpenChange={setOotOpen}
          onDone={() => void refetch()}
        />
      )}
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
