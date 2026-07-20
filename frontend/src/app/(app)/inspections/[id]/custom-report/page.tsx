"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft, RefreshCw, Loader2, Download, AlertTriangle, CheckCircle2,
  XCircle, Circle, FileCheck, PenLine, Lock,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ErrorState } from "@/components/error-state"
import { WorkflowProgress } from "@/components/workflow-progress"
import { SignDialog } from "@/components/sign-dialog"
import { SignatureBlock } from "@/components/signature-block"
import { SignHistoryPanel } from "@/components/sign-history-panel"
import { ExportMenu } from "@/components/export-menu"
import { useSignatures } from "@/lib/signatures"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"

interface Characteristic {
  id: number
  char_type: string
  requirement_string: string | null
}

interface Row {
  id: number
  custom_report_id: number
  characteristic_id: number | null
  row_number: number
  balloon_number: number | null
  field5_char_number: string | null
  field6_reference_location: string | null
  field7_char_designator: string | null
  field8_requirement: string | null
  field9_results: string | null
  field10_qa_acceptance: "accept" | "reject" | "na" | null
  field11_ncr_number: string | null
  field14_comments: string | null
  pass_fail: "pass" | "fail" | "not_measured" | "na"
  override_flag: boolean
  characteristic?: Characteristic | null
}

interface Template {
  id: number
  template_code: string
  header_title: string
  doc_number: string
  revision: string
  default_tolerances: string
  signature_statement: string
  columns_config: { key: string; label: string; width_pct: number }[]
  primary_color: string
}

interface Report {
  id: number
  ir_number: string
  inspection_session_id: number
  part_id: number
  inspection_plan_id: number
  fai_form1_id: number | null
  part_number: string | null
  part_name: string | null
  revision: string | null
  quantity: number
  report_title: string | null
  serial_lot_number: string | null
  work_order: string | null
  inspection_type: "receiving" | "in_process" | "final" | "other"
  tolerance_block: string | null
  tolerance_block_overridden: boolean
  inspector_name: string | null
  status: "draft" | "complete" | "signed"
  locked: boolean
  template: Template
  rows: Row[]
  part: { id: number; part_number: string; revision: string; description: string; fai_approved?: boolean } | null
  plan: { id: number; plan_number: string; plan_name: string } | null
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
  custom_report_id: number | null
}

const passFailColor: Record<string, string> = {
  pass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  fail: "bg-rose-50 text-rose-700 border-rose-200",
  not_measured: "bg-muted text-muted-foreground",
  na: "bg-slate-100 text-slate-500",
}

export default function CustomReportPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { hasPermission } = useAuthStore()
  const canEdit = hasPermission("inspections.edit")
  const canSign = hasPermission("inspections.sign")
  const canExport = hasPermission("inspections.export")

  const sessionId = params.id

  const [session, setSession] = useState<SessionInfo | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [summary, setSummary] = useState<{
    total: number; passed: number; failed: number; not_measured: number; complete: number; all_done: boolean;
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [signDialogOpen, setSignDialogOpen] = useState(false)
  const { signatures, refetch: refetchSignatures } = useSignatures(
    "CustomInspectionReport",
    report?.id ?? null,
  )
  const latestSignature = signatures.length ? signatures[signatures.length - 1] : null

  // header editable fields — ref-backed to avoid stale-closure in debounced save
  const [headerDraft, setHeaderDraft] = useState<Partial<Report>>({})
  const headerDraftRef = useRef<Partial<Report>>({})
  const [savingHeader, setSavingHeader] = useState(false)
  const headerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // row edits — ref-backed to avoid stale-closure in debounced save
  const [rowEdits, setRowEdits] = useState<Record<number, Partial<Row>>>({})
  const rowEditsRef = useRef<Record<number, Partial<Row>>>({})
  const [savingRow, setSavingRow] = useState<number | null>(null)
  const rowTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sessionRes = await api.get(`/workflow/sessions/${sessionId}`)
      const s: SessionInfo = sessionRes.data.session

      if (s.session_type !== "custom") {
        router.replace(`/inspections/${sessionId}/form3`)
        return
      }

      await api.post(`/custom-reports/session/${sessionId}/ensure`)
      const refreshed = await api.get(`/workflow/sessions/${sessionId}`)
      const finalSession: SessionInfo = refreshed.data.session
      setSession(finalSession)

      if (!finalSession.custom_report_id) {
        setError("Custom Report could not be created.")
        return
      }

      const reportRes = await api.get(`/custom-reports/${finalSession.custom_report_id}`)
      setReport(reportRes.data.report)
      setSummary(reportRes.data.summary)
      setRowEdits({})
      setHeaderDraft({})
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load custom report"))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Toast once after first load
  const firstLoadIdRef = useRef<number | null>(null)
  useEffect(() => {
    if (!report || firstLoadIdRef.current === report.id) return
    firstLoadIdRef.current = report.id
    if (summary?.total) {
      toast.success(`Requirements loaded from inspection plan (${summary.total} characteristics)`)
    }
  }, [report, summary])

  const queueHeaderSave = (patch: Partial<Report>) => {
    headerDraftRef.current = { ...headerDraftRef.current, ...patch }
    setHeaderDraft({ ...headerDraftRef.current })
    if (headerTimer.current) clearTimeout(headerTimer.current)
    headerTimer.current = setTimeout(() => doSaveHeader(), 1500)
  }

  const doSaveHeader = async () => {
    const payload = headerDraftRef.current
    if (Object.keys(payload).length === 0) return
    setSavingHeader(true)
    try {
      const { data } = await api.patch(`/custom-reports/${report?.id}`, payload)
      setReport((prev) => (prev ? { ...prev, ...data.report } : prev))
      headerDraftRef.current = {}
      setHeaderDraft({})
    } catch (err) {
      toast.error(getErrorMessage(err, "Header save failed"))
    } finally {
      setSavingHeader(false)
    }
  }

  const queueRowSave = (rowId: number, patch: Partial<Row>) => {
    rowEditsRef.current[rowId] = { ...rowEditsRef.current[rowId], ...patch }
    setRowEdits({ ...rowEditsRef.current })
    if (rowTimers.current[rowId]) clearTimeout(rowTimers.current[rowId])
    rowTimers.current[rowId] = setTimeout(() => doSaveRow(rowId), 1500)
  }

  const doSaveRow = async (rowId: number) => {
    const payload = rowEditsRef.current[rowId]
    if (!payload || Object.keys(payload).length === 0) return

    setSavingRow(rowId)
    try {
      const reportId = report?.id
      if (!reportId) return
      const { data } = await api.patch(`/custom-reports/${reportId}/rows/${rowId}`, payload)
      const updated: Row = data.row
      setReport((prev) => {
        if (!prev) return prev
        const rows = prev.rows.map((r) => (r.id === rowId ? { ...r, ...updated } : r))
        // Recompute summary against the freshly-merged rows
        const real = rows.filter((r) => r.characteristic_id)
        const passed = real.filter((r) => r.pass_fail === "pass").length
        const failed = real.filter((r) => r.pass_fail === "fail").length
        const not_measured = real.filter((r) => r.pass_fail === "not_measured").length
        setSummary({
          total: real.length,
          passed,
          failed,
          not_measured,
          complete: real.length - not_measured,
          all_done: real.length > 0 && not_measured === 0,
        })
        return { ...prev, rows }
      })
      delete rowEditsRef.current[rowId]
      setRowEdits({ ...rowEditsRef.current })
    } catch (err) {
      toast.error(getErrorMessage(err, "Row save failed"))
    } finally {
      setSavingRow(null)
    }
  }

  const handleSync = async () => {
    if (!report) return
    setSyncing(true)
    try {
      const { data } = await api.post(`/custom-reports/${report.id}/sync-from-plan`)
      toast.success(data.message)
      fetchAll()
    } catch (err) {
      toast.error(getErrorMessage(err, "Sync failed"))
    } finally {
      setSyncing(false)
    }
  }

  const handleImportFromFai = async () => {
    if (!report) return
    setImporting(true)
    try {
      const { data } = await api.post(`/custom-reports/${report.id}/import-from-fai`)
      toast.success(data.message)
      fetchAll()
    } catch (err) {
      toast.error(getErrorMessage(err, "Import failed"))
    } finally {
      setImporting(false)
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
    return <ErrorState title="Custom Report" description={error || "Not found"} onRetry={fetchAll} />
  }

  if (!report || !summary) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Custom report not available yet.
      </div>
    )
  }

  const completedSteps: number[] = []
  if (session.step1_complete) completedSteps.push(1)
  if (session.step2_complete) completedSteps.push(2)
  if (session.step3_complete) completedSteps.push(3)
  if (session.step4_complete) completedSteps.push(4)
  if (session.step5_complete) completedSteps.push(5)

  const pendingEdits = Object.keys(rowEdits).length
  const headerVal = (k: keyof Report) => (headerDraft[k] ?? report[k]) as string | number | null

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/inspections")} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Inspections
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{report.template.header_title}</h1>
          <p className="text-sm text-muted-foreground">
            {report.template.doc_number} Rev {report.template.revision} · IR <span className="font-mono">{report.ir_number}</span>
            {report.locked && <Badge variant="secondary" className="ml-2">SIGNED · LOCKED</Badge>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SignHistoryPanel signableType="CustomInspectionReport" signableId={report.id} />
          <ExportMenu
            kind="custom-report"
            id={report.id}
            identifier={report.ir_number}
            canExport={canExport}
          />
          {report.fai_form1_id && (
            <Button variant="outline" size="sm" onClick={handleImportFromFai} disabled={importing || report.locked}>
              {importing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileCheck className="mr-1 h-3.5 w-3.5" />}
              Import from FAI Form 3
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing || report.locked}>
            {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Sync from plan
          </Button>
          {canSign && (
          <Button
            size="sm"
            disabled={!summary.all_done || report.locked}
            onClick={() => setSignDialogOpen(true)}
          >
            {report.locked ? (
              <>
                <Lock className="mr-1 h-3.5 w-3.5" />
                Signed
              </>
            ) : (
              <>
                <PenLine className="mr-1 h-3.5 w-3.5" />
                {summary.all_done
                  ? "Sign & Lock"
                  : `${summary.not_measured} more to measure`}
              </>
            )}
          </Button>
          )}
        </div>
      </div>

      <WorkflowProgress currentStep={4} completedSteps={completedSteps} sessionId={session.id} sessionType="custom" />

      {/* Header — 2 rows per doc */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Report Header</CardTitle>
          <CardDescription>
            Auto-filled fields stay locked. Inspector edits Quantity + Tolerance + Title.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1 — 4 cells */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <Label className="text-xs">Part Number</Label>
              <div className="mt-0.5 font-mono text-sm font-semibold">{report.part_number || "—"}</div>
            </div>
            <div>
              <Label className="text-xs">Part Name</Label>
              <div className="mt-0.5 text-sm">{report.part_name || "—"}</div>
            </div>
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input
                type="number"
                min={1}
                value={(headerVal("quantity") as number) ?? 1}
                onChange={(e) => queueHeaderSave({ quantity: parseInt(e.target.value, 10) || 1 })}
                disabled={!canEdit || report.locked}
                className="mt-0.5 h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Report #</Label>
              <div className="mt-0.5 font-mono text-sm">{report.ir_number}</div>
            </div>
          </div>

          {/* Row 2 — 3 cells */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label className="text-xs">Revision</Label>
              <div className="mt-0.5 font-mono text-sm">{report.revision || "—"}</div>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-2">
                Tolerance Block
                {report.tolerance_block_overridden && (
                  <Badge variant="outline" className="text-[10px]">Overridden</Badge>
                )}
              </Label>
              <Input
                value={(headerVal("tolerance_block") as string) ?? ""}
                onChange={(e) => queueHeaderSave({ tolerance_block: e.target.value, tolerance_block_overridden: true })}
                disabled={!canEdit || report.locked}
                className="mt-0.5 h-8 font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Inspector</Label>
              <div className="mt-0.5 text-sm">{report.inspector_name || "—"}</div>
            </div>
          </div>

          {/* Additional editable header info */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label className="text-xs">Report Title</Label>
              <Input
                value={(headerVal("report_title") as string) ?? ""}
                onChange={(e) => queueHeaderSave({ report_title: e.target.value })}
                placeholder="Bracket #42 in-process check"
                disabled={!canEdit || report.locked}
                className="mt-0.5 h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Serial / Lot #</Label>
              <Input
                value={(headerVal("serial_lot_number") as string) ?? ""}
                onChange={(e) => queueHeaderSave({ serial_lot_number: e.target.value })}
                placeholder="SN-0042"
                disabled={!canEdit || report.locked}
                className="mt-0.5 h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Work Order</Label>
              <Input
                value={(headerVal("work_order") as string) ?? ""}
                onChange={(e) => queueHeaderSave({ work_order: e.target.value })}
                placeholder="WO-2026-00342"
                disabled={!canEdit || report.locked}
                className="mt-0.5 h-8 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label className="text-xs">Inspection Type</Label>
              <Select
                value={(headerVal("inspection_type") as string) ?? "final"}
                onValueChange={(v) => queueHeaderSave({ inspection_type: v as Report["inspection_type"] })}
                disabled={!canEdit || report.locked}
              >
                <SelectTrigger className="mt-0.5 h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receiving">Receiving</SelectItem>
                  <SelectItem value="in_process">In Process</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex items-end text-xs text-muted-foreground">
              {savingHeader ? (
                <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving header...</span>
              ) : Object.keys(headerDraft).length > 0 ? (
                <span className="text-amber-600">Unsaved changes...</span>
              ) : (
                <span>Saved ✓</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary banner */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Complete</div>
              <div className="text-xl font-semibold">
                {summary.complete} / {summary.total}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Passed</div>
              <div className="text-xl font-semibold text-emerald-700">{summary.passed}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Failed</div>
              <div className="text-xl font-semibold text-rose-700">{summary.failed}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Not measured</div>
              <div className="text-xl font-semibold text-muted-foreground">{summary.not_measured}</div>
            </div>
          </div>
          <div>
            {summary.all_done ? (
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

      {/* Section divider band per doc */}
      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-2 text-sm font-semibold uppercase tracking-wide text-white">
          <div className="bg-[#1F4E79] px-4 py-2">Characteristic Accountability</div>
          <div className="bg-[#2E75B6] px-4 py-2">Inspection / Test Results</div>
        </div>
      </div>

      {/* 20-row table per doc spec */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                {report.template.columns_config.map((col) => (
                  <th
                    key={col.key}
                    className="px-2 py-2 font-medium"
                    style={{ width: `${col.width_pct}%` }}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-2 py-2 font-medium">Pass/Fail</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => {
                const e = rowEdits[row.id] || {}
                const isEmptyRow = !row.characteristic_id
                const result = (e.field9_results ?? row.field9_results) ?? ""
                const qa = (e.field10_qa_acceptance ?? row.field10_qa_acceptance) ?? ""
                const isFail = row.pass_fail === "fail"
                const isPass = row.pass_fail === "pass"
                const isSaving = savingRow === row.id

                return (
                  <tr
                    key={row.id}
                    className={
                      isFail
                        ? "border-b border-l-4 border-l-rose-500 bg-rose-50/30"
                        : isPass
                          ? "border-b bg-emerald-50/20"
                          : isEmptyRow
                            ? "border-b bg-muted/10 text-muted-foreground"
                            : "border-b"
                    }
                  >
                    <td className="px-2 py-1.5 font-mono">{row.row_number}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={(e.field6_reference_location ?? row.field6_reference_location) ?? ""}
                        onChange={(ev) => queueRowSave(row.id, { field6_reference_location: ev.target.value })}
                        disabled={!canEdit || isEmptyRow || report.locked}
                        placeholder={isEmptyRow ? "" : "A3"}
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={(e.field7_char_designator ?? row.field7_char_designator) ?? ""}
                        onChange={(ev) => queueRowSave(row.id, { field7_char_designator: ev.target.value })}
                        disabled={!canEdit || isEmptyRow || report.locked}
                        placeholder={isEmptyRow ? "" : "Key"}
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5 font-mono">{row.field8_requirement || "—"}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={result}
                        onChange={(ev) => queueRowSave(row.id, { field9_results: ev.target.value })}
                        disabled={!canEdit || isEmptyRow || report.locked}
                        placeholder={isEmptyRow ? "" : "Enter result..."}
                        className="h-7 font-mono text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={qa || "auto"}
                        onValueChange={(v) =>
                          queueRowSave(row.id, {
                            field10_qa_acceptance: v === "auto" ? null : (v as Row["field10_qa_acceptance"]),
                          })
                        }
                        disabled={!canEdit || isEmptyRow || report.locked}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="accept">Accept</SelectItem>
                          <SelectItem value="reject">Reject</SelectItem>
                          <SelectItem value="na">N/A</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={(e.field11_ncr_number ?? row.field11_ncr_number) ?? ""}
                        onChange={(ev) => queueRowSave(row.id, { field11_ncr_number: ev.target.value })}
                        disabled={!canEdit || isEmptyRow || !isFail || report.locked}
                        placeholder={isFail ? "NCR # required" : ""}
                        className={`h-7 text-xs ${isFail ? "border-amber-400" : ""}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={(e.field14_comments ?? row.field14_comments) ?? ""}
                        onChange={(ev) => queueRowSave(row.id, { field14_comments: ev.target.value })}
                        disabled={!canEdit || isEmptyRow || report.locked}
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {!isEmptyRow ? (
                        <Badge variant="outline" className={`text-[9px] ${passFailColor[row.pass_fail]}`}>
                          {row.pass_fail === "pass" && <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />}
                          {row.pass_fail === "fail" && <XCircle className="mr-0.5 h-2.5 w-2.5" />}
                          {row.pass_fail === "not_measured" && <Circle className="mr-0.5 h-2.5 w-2.5" />}
                          {row.pass_fail.replace("_", " ")}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">empty</span>
                      )}
                      {isSaving && <Loader2 className="ml-1 inline h-3 w-3 animate-spin text-muted-foreground" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Signature block per doc 3.5 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Signature
            {report.locked && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                LOCKED
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="rounded border-l-4 border-primary/60 bg-muted/30 p-3 text-sm italic">
            {report.template.signature_statement}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Prepared By</Label>
              <div className="mt-0.5 text-sm font-medium text-muted-foreground">
                {report.inspector_name || "—"}
              </div>
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <div className="mt-0.5 text-sm font-medium text-muted-foreground">
                {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
          {!report.locked && (
            <p className="text-xs text-muted-foreground">
              Signing requires password re-verify. Once signed, the report locks and no further edits are possible.
            </p>
          )}
        </CardContent>
      </Card>

      {latestSignature && (
        <SignatureBlock signature={latestSignature} />
      )}

      {summary.failed > 0 && !report.locked && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="flex items-start gap-3 py-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <strong>{summary.failed}</strong> failed row{summary.failed > 1 ? "s" : ""} —
              {" "}NCR number required on each before this report can be signed.
            </div>
          </CardContent>
        </Card>
      )}

      <SignDialog
        open={signDialogOpen}
        onOpenChange={setSignDialogOpen}
        signableType="CustomInspectionReport"
        signableId={report.id}
        statement={report.template?.signature_statement}
        allowedRoles={["inspector", "qa_manager"]}
        onSigned={() => {
          void fetchAll()
          void refetchSignatures()
        }}
      />
    </div>
  )
}
