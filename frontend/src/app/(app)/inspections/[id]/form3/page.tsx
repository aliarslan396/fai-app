"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft, RefreshCw, Loader2, ExternalLink, AlertTriangle,
  CheckCircle2, Circle, XCircle, PenLine, Lock, Plus,
} from "lucide-react"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ErrorState } from "@/components/error-state"
import { WorkflowProgress } from "@/components/workflow-progress"
import { SignDialog } from "@/components/sign-dialog"
import { SignatureBlock } from "@/components/signature-block"
import { SignHistoryPanel } from "@/components/sign-history-panel"
import { ExportMenu } from "@/components/export-menu"
import { CreateNcrDialog } from "@/components/ncr/create-ncr-dialog"
import { RelatedNcrsPanel, type RelatedNcrsPanelHandle } from "@/components/ncr/related-ncrs-panel"
import { FaiStatusControls } from "@/components/fai-status-controls"
import { AssemblyIndexPanel } from "@/components/fai/assembly-index-panel"
import { useSignatures } from "@/lib/signatures"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"

interface CharacteristicSnapshot {
  id: number
  char_type: string
  description: string | null
  requirement_string: string | null
  unit: string | null
  nominal: number | string | null
  upper_tolerance: number | string | null
  lower_tolerance: number | string | null
}

interface Form3Row {
  id: number
  fai_form1_id: number
  characteristic_id: number
  balloon_number: number
  field5_char_number: string | null
  field6_reference_location: string | null
  field7_char_designator: string | null
  field8_requirement: string | null
  field9_results: string | null
  field10_qualified_tooling: string | null
  field11_nonconformance_number: string | null
  field14_additional_comments: string | null
  pass_fail: "pass" | "fail" | "not_measured" | "na"
  override_flag: boolean
  characteristic: CharacteristicSnapshot
}

interface Form3Response {
  form1: { id: number; fai_number: string; status: string; locked: boolean; returned_reason?: string | null }
  rows: Form3Row[]
  summary: {
    total: number
    passed: number
    failed: number
    not_measured: number
    complete: number
    all_done: boolean
  }
}

interface SessionInfo {
  id: number
  session_type: "as9102" | "custom"
  current_step: number
  step1_complete: boolean
  step2_complete: boolean
  step3_complete: boolean
  step4_complete: boolean
  step5_complete: boolean
  step6_complete: boolean
  fai_id: number | null
  part: { id: number; part_number: string; revision: string; description: string } | null
  plan: { id: number; plan_number: string; plan_name: string } | null
}

const passFailColor: Record<string, string> = {
  pass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  fail: "bg-rose-50 text-rose-700 border-rose-200",
  not_measured: "bg-muted text-muted-foreground",
  na: "bg-slate-100 text-slate-700",
}

export default function Form3Page() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { hasPermission } = useAuthStore()
  const canEdit = hasPermission("inspections.edit")
  const canSign = hasPermission("inspections.sign")
  const canExport = hasPermission("inspections.export")

  const sessionId = params.id

  const [session, setSession] = useState<SessionInfo | null>(null)
  const [data, setData] = useState<Form3Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [signDialogOpen, setSignDialogOpen] = useState(false)
  const [ncrPrefillRow, setNcrPrefillRow] = useState<Form3Row | null>(null)
  const relatedNcrsRef = useRef<RelatedNcrsPanelHandle | null>(null)
  const { signatures, refetch: refetchSignatures } = useSignatures(
    "FaiForm1",
    data?.form1?.id ?? null,
  )
  const latestSignature = signatures.length ? signatures[signatures.length - 1] : null

  // Local edit state — ref-backed to avoid stale-closure in debounced save
  const [edits, setEdits] = useState<Record<number, Partial<Form3Row>>>({})
  const editsRef = useRef<Record<number, Partial<Form3Row>>>({})
  const [savingRow, setSavingRow] = useState<number | null>(null)
  const saveTimer = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sessionRes = await api.get(`/workflow/sessions/${sessionId}`)
      const s: SessionInfo = sessionRes.data.session

      if (s.session_type !== "as9102") {
        router.replace(`/inspections/${sessionId}/custom-report`)
        return
      }

      // Ensure the FAI record exists (creates + first-time syncs from balloons)
      await api.post(`/fai/session/${sessionId}/ensure`)

      // Re-fetch session to pick up fai_id
      const refreshed = await api.get(`/workflow/sessions/${sessionId}`)
      const finalSession: SessionInfo = refreshed.data.session
      setSession(finalSession)

      if (!finalSession.fai_id) {
        setError("FAI record could not be created.")
        return
      }

      const form3Res = await api.get(`/fai/${finalSession.fai_id}/form3`)
      setData(form3Res.data)
      setEdits({})
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load Form 3"))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // First-time toast after load
  useEffect(() => {
    if (data && data.summary.total > 0 && data.summary.complete === 0) {
      toast.success(`Requirements loaded from inspection plan (${data.summary.total} characteristics)`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.form1.id])

  const handleResync = async () => {
    if (!data) return
    setSyncing(true)
    try {
      const { data: r } = await api.post(`/fai/${data.form1.id}/sync-from-balloons`)
      toast.success(r.message)
      // Re-fetch Form 3
      const form3Res = await api.get(`/fai/${data.form1.id}/form3`)
      setData(form3Res.data)
      setEdits({})
    } catch (err) {
      toast.error(getErrorMessage(err, "Re-sync failed"))
    } finally {
      setSyncing(false)
    }
  }

  const queueSave = (rowId: number, changes: Partial<Form3Row>) => {
    editsRef.current[rowId] = { ...editsRef.current[rowId], ...changes }
    setEdits({ ...editsRef.current })

    if (saveTimer.current[rowId]) clearTimeout(saveTimer.current[rowId])
    saveTimer.current[rowId] = setTimeout(() => doSave(rowId), 1500)
  }

  const doSave = async (rowId: number) => {
    const payload = editsRef.current[rowId]
    if (!payload || Object.keys(payload).length === 0) return

    setSavingRow(rowId)
    try {
      const form1Id = data?.form1.id
      if (!form1Id) return
      const { data: r } = await api.patch(
        `/fai/${form1Id}/form3/rows/${rowId}`,
        payload
      )
      // Replace just this row in state
      setData((prev) => {
        if (!prev) return prev
        const rows = prev.rows.map((row) => (row.id === rowId ? r.row : row))
        // Recompute summary
        const passed = rows.filter((r) => r.pass_fail === "pass").length
        const failed = rows.filter((r) => r.pass_fail === "fail").length
        const not_measured = rows.filter((r) => r.pass_fail === "not_measured").length
        return {
          ...prev,
          rows,
          summary: {
            total: rows.length,
            passed,
            failed,
            not_measured,
            complete: rows.length - not_measured,
            all_done: rows.length > 0 && not_measured === 0,
          },
        }
      })
      delete editsRef.current[rowId]
      setEdits({ ...editsRef.current })
    } catch (err) {
      toast.error(getErrorMessage(err, "Row save failed"))
    } finally {
      setSavingRow(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !session) {
    return <ErrorState title="Form 3" description={error || "Not found"} onRetry={fetchAll} />
  }

  if (!data) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Form 3 not available yet.
      </div>
    )
  }

  const completedSteps: number[] = []
  if (session.step1_complete) completedSteps.push(1)
  if (session.step2_complete) completedSteps.push(2)
  if (session.step3_complete) completedSteps.push(3)
  if (session.step4_complete) completedSteps.push(4)
  if (session.step5_complete) completedSteps.push(5)

  const pendingEdits = Object.keys(edits).length

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/inspections")} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Inspections
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Form 3 — Characteristic Verification
          </h1>
          <p className="text-sm text-muted-foreground">
            {session.part && `${session.part.part_number} Rev ${session.part.revision} · `}
            FAI <span className="font-mono">{data.form1.fai_number}</span>
            {data.form1.locked && (
              <Badge variant="secondary" className="ml-2">LOCKED</Badge>
            )}
          </p>
          <FaiStatusControls
            formId={data.form1.id}
            faiNumber={data.form1.fai_number}
            status={data.form1.status}
            returnedReason={data.form1.returned_reason}
            allDone={data.summary.all_done}
            locked={data.form1.locked}
            onChanged={() => void fetchAll()}
          />
        </div>
        <div className="flex items-center gap-2">
          <SignHistoryPanel signableType="FaiForm1" signableId={data.form1.id} />
          <ExportMenu
            kind="as9102"
            id={data.form1.id}
            identifier={data.form1.fai_number}
            canExport={canExport}
          />
          <Button variant="outline" size="sm" onClick={handleResync} disabled={syncing || data.form1.locked}>
            {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Re-sync from plan
          </Button>
          {/* Sign & Lock is the ACCEPT action per doc 3.4. Only exposed once
              the form is in `submitted` status (or already locked, to keep
              the "Signed" pill visible). Inspector-then-Manager review is
              enforced via the status lifecycle — sign is not available on
              in_work or returned forms. */}
          {canSign && (data.form1.status === "submitted" || data.form1.locked) && (
          <Button
            size="sm"
            onClick={() => setSignDialogOpen(true)}
            disabled={data.form1.locked || !data.summary.all_done}
          >
            {data.form1.locked ? (
              <>
                <Lock className="mr-1 h-3.5 w-3.5" />
                Signed
              </>
            ) : (
              <>
                <PenLine className="mr-1 h-3.5 w-3.5" />
                {data.summary.all_done
                  ? "Sign & Lock"
                  : `${data.summary.not_measured} more to measure`}
              </>
            )}
          </Button>
          )}
        </div>
      </div>

      <WorkflowProgress currentStep={4} completedSteps={completedSteps} sessionId={session.id} sessionType="as9102" />

      <RelatedNcrsPanel ref={relatedNcrsRef} sessionId={session.id} />

      {/* Summary banner */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Complete</div>
              <div className="text-xl font-semibold">
                {data.summary.complete} / {data.summary.total}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Passed</div>
              <div className="text-xl font-semibold text-emerald-700">{data.summary.passed}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Failed</div>
              <div className="text-xl font-semibold text-rose-700">{data.summary.failed}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Not measured</div>
              <div className="text-xl font-semibold text-muted-foreground">{data.summary.not_measured}</div>
            </div>
          </div>
          <div>
            {data.summary.all_done ? (
              <Badge className="bg-emerald-600 text-base">
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                All complete — ready to sign
              </Badge>
            ) : pendingEdits > 0 ? (
              <Badge variant="outline">
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                {pendingEdits} unsaved...
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">Saved ✓</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Assembly Index (Form 1 fields 15-18) per doc 3.4 */}
      <AssemblyIndexPanel
        formId={data.form1.id}
        locked={data.form1.locked}
        canEdit={canEdit}
      />

      {/* Form 3 measurement table */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Characteristic Accountability / Inspection Results</h2>
          <p className="text-sm text-muted-foreground">
            Measure each balloon on the actual part and enter the result. Pass/fail computes automatically.
          </p>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No characteristics defined on the plan yet. Add balloons in the plan workspace first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">5. Char #</TableHead>
                    <TableHead className="w-28">6. Reference</TableHead>
                    <TableHead className="w-28">7. Designator</TableHead>
                    <TableHead>8. Requirements</TableHead>
                    <TableHead className="w-44">9. Results</TableHead>
                    <TableHead className="w-32">10. Tooling</TableHead>
                    <TableHead className="w-28">Pass/Fail</TableHead>
                    <TableHead className="w-32">11. NCR #</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => {
                    const e = edits[row.id] || {}
                    const result = (e.field9_results ?? row.field9_results) || ""
                    const isFail = row.pass_fail === "fail"
                    const isPass = row.pass_fail === "pass"
                    const isSaving = savingRow === row.id
                    return (
                      <TableRow
                        key={row.id}
                        className={
                          isFail
                            ? "border-l-4 border-l-rose-500 bg-rose-50/30"
                            : isPass
                              ? "bg-emerald-50/20"
                              : ""
                        }
                      >
                        <TableCell className="font-mono font-semibold">
                          {row.balloon_number}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={(e.field6_reference_location ?? row.field6_reference_location) || ""}
                            onChange={(ev) => queueSave(row.id, { field6_reference_location: ev.target.value })}
                            disabled={!canEdit || data.form1.locked}
                            placeholder="A3"
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={(e.field7_char_designator ?? row.field7_char_designator) || ""}
                            onChange={(ev) => queueSave(row.id, { field7_char_designator: ev.target.value })}
                            disabled={!canEdit || data.form1.locked}
                            placeholder="Key"
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1">
                            <span>{row.field8_requirement || row.characteristic?.requirement_string || "—"}</span>
                            <Link
                              href={`/plans/${row.characteristic ? "" : ""}`}
                              className="text-muted-foreground opacity-50 hover:opacity-100"
                              title="Edit balloon in plan workspace"
                              onClick={(ev) => {
                                ev.preventDefault()
                                if (session.plan) {
                                  router.push(`/plans/${session.plan.id}/workspace`)
                                }
                              }}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={result}
                            onChange={(ev) => queueSave(row.id, { field9_results: ev.target.value })}
                            disabled={!canEdit || data.form1.locked}
                            placeholder="Enter result..."
                            className="h-8 text-sm font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={(e.field10_qualified_tooling ?? row.field10_qualified_tooling) || ""}
                            onChange={(ev) => queueSave(row.id, { field10_qualified_tooling: ev.target.value })}
                            disabled={!canEdit || data.form1.locked}
                            placeholder="Calipers"
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${passFailColor[row.pass_fail] || ""}`}>
                            {row.pass_fail === "pass" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                            {row.pass_fail === "fail" && <XCircle className="mr-1 h-3 w-3" />}
                            {row.pass_fail === "not_measured" && <Circle className="mr-1 h-3 w-3" />}
                            {row.pass_fail.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              value={(e.field11_nonconformance_number ?? row.field11_nonconformance_number) || ""}
                              onChange={(ev) => queueSave(row.id, { field11_nonconformance_number: ev.target.value })}
                              disabled={!canEdit || data.form1.locked || !isFail}
                              placeholder={isFail ? "NCR # required" : ""}
                              className={`h-8 text-xs ${isFail ? "border-amber-400" : ""}`}
                            />
                            {isFail && canEdit && !data.form1.locked && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 shrink-0"
                                onClick={() => setNcrPrefillRow(row)}
                                title="Create NCR from this failed row"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {isSaving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          ) : edits[row.id] ? (
                            <span className="text-[10px] text-amber-600">Saving...</span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {data.summary.failed > 0 && !data.form1.locked && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="flex items-start gap-3 py-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <strong>{data.summary.failed}</strong> failed characteristic{data.summary.failed > 1 ? "s" : ""} —
              {" "}
              an NCR number is required for each red row before this inspection can be signed.
            </div>
          </CardContent>
        </Card>
      )}

      {latestSignature && (
        <SignatureBlock signature={latestSignature} />
      )}

      <SignDialog
        open={signDialogOpen}
        onOpenChange={setSignDialogOpen}
        signableType="FaiForm1"
        signableId={data.form1.id}
        allowedRoles={["inspector", "qa_manager"]}
        onSigned={() => {
          void fetchAll()
          void refetchSignatures()
        }}
      />

      {ncrPrefillRow && (
        <CreateNcrDialog
          open={!!ncrPrefillRow}
          onOpenChange={(v) => !v && setNcrPrefillRow(null)}
          prefill={{
            source_type: "FaiForm3Row",
            source_id: ncrPrefillRow.id,
            part_id: session.part?.id ?? null,
            inspection_session_id: session.id,
            characteristic_ref: ncrPrefillRow.field5_char_number ?? String(ncrPrefillRow.balloon_number),
            requirement: ncrPrefillRow.field8_requirement ?? ncrPrefillRow.characteristic?.requirement_string ?? null,
            actual_result: ncrPrefillRow.field9_results,
            unit: ncrPrefillRow.characteristic?.unit ?? null,
          }}
          onCreated={(ncr) => {
            queueSave(ncrPrefillRow.id, { field11_nonconformance_number: ncr.ncr_number })
            relatedNcrsRef.current?.refetch()
            setNcrPrefillRow(null)
          }}
        />
      )}
    </div>
  )
}
