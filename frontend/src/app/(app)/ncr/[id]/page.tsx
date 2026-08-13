"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  ClipboardCheck,
  CheckCircle2,
  Info,
  ShieldCheck,
  GitBranch,
} from "lucide-react"
import { toast } from "sonner"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { DispositionDialog } from "@/components/ncr/disposition-dialog"
import { CloseNcrDialog } from "@/components/ncr/close-dialog"
import { VerifyNcrDialog } from "@/components/ncr/verify-dialog"
import { NcrAttachmentsPanel } from "@/components/ncr/attachments-panel"
import { useAuthStore } from "@/lib/auth-store"
import {
  DETECTION_POINT_LABEL,
  DISPOSITION_LABEL,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  useNcr,
} from "@/lib/ncrs"

function fmtDateTime(iso: string | null) {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    const hh = String(d.getHours()).padStart(2, "0")
    const mi = String(d.getMinutes()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
  } catch {
    return iso
  }
}

export default function NcrDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { user, hasPermission } = useAuthStore()
  const canDisposition = hasPermission("ncr.disposition")
  const canClose = hasPermission("ncr.close")
  const canEdit = hasPermission("ncr.edit")
  const currentUserId = user?.id ?? null

  const id = Number(params.id)
  const { ncr, loading, error, refetch } = useNcr(Number.isFinite(id) ? id : null)

  const [dispOpen, setDispOpen] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [escalateConfirm, setEscalateConfirm] = useState(false)
  const [escalating, setEscalating] = useState(false)

  const handleEscalate = async () => {
    if (!ncr) return
    setEscalating(true)
    try {
      const { data } = await api.post<{ capa: { id: number; capa_number: string } }>(
        `/ncrs/${ncr.id}/escalate`,
      )
      toast.success(`Escalated to ${data.capa.capa_number}`)
      setEscalateConfirm(false)
      void refetch()
    } catch (err) {
      toast.error(getErrorMessage(err, "Escalate failed"))
    } finally {
      setEscalating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading NCR…
      </div>
    )
  }

  if (error || !ncr) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/ncr")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> NCRs
        </Button>
        <div className="rounded border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {error ?? "NCR not found."}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/ncr")} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> NCRs
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
            <span className="font-mono">{ncr.ncr_number}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className={SEVERITY_COLOR[ncr.severity]}>
              {SEVERITY_LABEL[ncr.severity]}
            </Badge>
            <Badge variant="outline" className={STATUS_COLOR[ncr.status]}>
              {STATUS_LABEL[ncr.status]}
            </Badge>
            {ncr.capa_id && (
              <Link
                href={`/capa/${ncr.capa_id}`}
                className="inline-flex items-center gap-1 rounded-md border border-purple-300 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-800 hover:bg-purple-100"
                title="Root cause investigation opened for this NCR"
              >
                <GitBranch className="h-3 w-3" />
                Escalated to CAPA
              </Link>
            )}
            <span>· created {fmtDateTime(ncr.created_at)}</span>
            {ncr.creator && <span>by {ncr.creator.name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ncr.status === "open" && canDisposition && (
            <Button onClick={() => setDispOpen(true)}>
              <ClipboardCheck className="mr-1 h-4 w-4" />
              Disposition
            </Button>
          )}
          {ncr.status === "dispositioned" && !ncr.verified_at && canClose && (
            <Button onClick={() => setVerifyOpen(true)}>
              <ShieldCheck className="mr-1 h-4 w-4" />
              Verify Action
            </Button>
          )}
          {ncr.status === "dispositioned" && ncr.verified_at && canClose && (
            <Button
              onClick={() => setCloseOpen(true)}
              disabled={ncr.verified_by === currentUserId}
              title={
                ncr.verified_by === currentUserId
                  ? "Two-signature rule: a different user must close (you verified this NCR)."
                  : "Second sign-off — close the NCR"
              }
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              Close NCR
            </Button>
          )}
          {ncr.status !== "open" && !ncr.capa_id && canEdit && (
            <Button
              variant="outline"
              onClick={() => setEscalateConfirm(true)}
              title="Open a CAPA — root cause investigation for a recurring or critical defect"
            >
              <GitBranch className="mr-1 h-4 w-4" />
              Escalate to CAPA
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Defect Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FieldRow label="Part">
              {ncr.part ? (
                <span>
                  <span className="font-medium">{ncr.part.part_number}</span>
                  {ncr.part.description && <span className="ml-2 text-muted-foreground">{ncr.part.description}</span>}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </FieldRow>
            <FieldRow label="Characteristic">
              {ncr.characteristic_ref ? (
                <span className="font-mono">{ncr.characteristic_ref}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </FieldRow>
            <FieldRow label="Requirement">
              <span className="font-mono text-sm">{ncr.requirement ?? "—"}</span>
            </FieldRow>
            <FieldRow label="Actual Result">
              <span className="font-mono text-sm">{ncr.actual_result ?? "—"} {ncr.unit ?? ""}</span>
            </FieldRow>

            {(ncr.lot_serial || ncr.quantity_affected != null || ncr.defect_code) && (
              <>
                <Separator />
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Traceability
                </div>
                {ncr.lot_serial && (
                  <FieldRow label="Lot / Serial">
                    <span className="font-mono text-sm">{ncr.lot_serial}</span>
                  </FieldRow>
                )}
                {ncr.quantity_affected != null && (
                  <FieldRow label="Qty Affected">
                    <span>{ncr.quantity_affected}</span>
                  </FieldRow>
                )}
                {ncr.defect_code && (
                  <FieldRow label="Defect Code">
                    <span className="font-mono text-sm">{ncr.defect_code}</span>
                  </FieldRow>
                )}
              </>
            )}

            {(ncr.detection_point || ncr.detector) && (
              <>
                <Separator />
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Detection
                </div>
                {ncr.detection_point && (
                  <FieldRow label="Detection Point">
                    <span>{DETECTION_POINT_LABEL[ncr.detection_point]}</span>
                  </FieldRow>
                )}
                {ncr.detector && (
                  <FieldRow label="Detected By">
                    <span>{ncr.detector.name}</span>
                  </FieldRow>
                )}
              </>
            )}

            {(ncr.material_cost != null || ncr.labor_hours != null || ncr.scrap_value != null) && (
              <>
                <Separator />
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Cost of Quality
                </div>
                {ncr.material_cost != null && (
                  <FieldRow label="Material">
                    <span>${Number(ncr.material_cost).toFixed(2)}</span>
                  </FieldRow>
                )}
                {ncr.labor_hours != null && (
                  <FieldRow label="Labor">
                    <span>{Number(ncr.labor_hours).toFixed(2)} hrs</span>
                  </FieldRow>
                )}
                {ncr.scrap_value != null && (
                  <FieldRow label="Scrap Value">
                    <span>${Number(ncr.scrap_value).toFixed(2)}</span>
                  </FieldRow>
                )}
                {ncr.cost_of_quality != null && ncr.cost_of_quality > 0 && (
                  <FieldRow label="Total Impact">
                    <span className="font-semibold text-amber-700">
                      ${ncr.cost_of_quality.toFixed(2)}
                    </span>
                  </FieldRow>
                )}
              </>
            )}

            {ncr.cause && (
              <>
                <Separator />
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Cause
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{ncr.cause}</div>
                </div>
              </>
            )}
            {ncr.source_type && ncr.source_id && (
              <>
                <Separator />
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5" />
                  <span>
                    Auto-created from failed row in{" "}
                    <span className="font-mono">
                      {ncr.source_type.split("\\").pop()} #{ncr.source_id}
                    </span>
                    {ncr.inspection_session_id && (
                      <>
                        {" "}·{" "}
                        <Link
                          href={
                            ncr.source_type?.includes("CustomReport")
                              ? `/inspections/${ncr.inspection_session_id}/custom-report`
                              : `/inspections/${ncr.inspection_session_id}/form3`
                          }
                          className="text-primary hover:underline"
                        >
                          view inspection
                        </Link>
                      </>
                    )}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Attachments (doc 3.10) — full-width card between Defect Snapshot + Workflow */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Attachments</CardTitle>
          </CardHeader>
          <CardContent>
            <NcrAttachmentsPanel
              ncrId={ncr.id}
              attachments={ncr.attachments ?? []}
              canEdit={canEdit}
              isClosed={ncr.status === "closed"}
              onChange={refetch}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Workflow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TimelineStep
              done
              label="Reported"
              detail={`${ncr.creator?.name ?? "Unknown"} · ${fmtDateTime(ncr.created_at)}`}
            />
            <TimelineStep
              done={ncr.status !== "open"}
              label={`Dispositioned: ${DISPOSITION_LABEL[ncr.disposition]}`}
              detail={
                ncr.dispositioned_at
                  ? `${ncr.dispositioner?.name ?? "?"} · ${fmtDateTime(ncr.dispositioned_at)}`
                  : "Pending QA Manager review"
              }
            />
            <TimelineStep
              done={!!ncr.verified_at}
              label="Verified (Sign-off 1)"
              detail={
                ncr.verified_at
                  ? `${ncr.verifier?.name ?? "?"} · ${fmtDateTime(ncr.verified_at)}`
                  : ncr.status === "dispositioned"
                    ? "Awaiting verification of corrective action"
                    : "—"
              }
            />
            <TimelineStep
              done={ncr.status === "closed"}
              label="Closed (Sign-off 2)"
              detail={
                ncr.closed_at
                  ? `${ncr.closer?.name ?? "?"} · ${fmtDateTime(ncr.closed_at)}`
                  : "Pending closure after action verified"
              }
            />
          </CardContent>
        </Card>
      </div>

      {(ncr.disposition_notes || ncr.closure_notes) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ncr.disposition_notes && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Disposition
                </div>
                <div className="whitespace-pre-wrap text-sm">{ncr.disposition_notes}</div>
              </div>
            )}
            {ncr.closure_notes && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Closure
                </div>
                <div className="whitespace-pre-wrap text-sm">{ncr.closure_notes}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <DispositionDialog
        open={dispOpen}
        onOpenChange={setDispOpen}
        ncr={ncr}
        onDone={() => void refetch()}
      />
      <VerifyNcrDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        ncr={ncr}
        onDone={() => void refetch()}
      />
      <CloseNcrDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        ncr={ncr}
        onDone={() => void refetch()}
      />

      <AlertDialog
        open={escalateConfirm}
        onOpenChange={(open) => !escalating && setEscalateConfirm(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-purple-600" />
              Escalate {ncr.ncr_number} to CAPA?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Opens a Corrective &amp; Preventive Action for root-cause investigation.
              Part, defect code, quantity, and detection point copy over from this NCR.
              This NCR and the new CAPA will be permanently linked. This action is
              audit-logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={escalating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEscalate} disabled={escalating}>
              {escalating && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Create CAPA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 items-baseline gap-3 text-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="col-span-2">{children}</div>
    </div>
  )
}

function TimelineStep({
  done,
  label,
  detail,
}: {
  done: boolean
  label: string
  detail: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-muted-foreground/30 bg-background text-muted-foreground"
        }`}
      >
        {done && <CheckCircle2 className="h-3 w-3" />}
      </div>
      <div className="text-sm">
        <div className={done ? "font-medium" : "text-muted-foreground"}>{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  )
}
