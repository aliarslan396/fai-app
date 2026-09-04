import api from "./api"

export interface ReportFilters {
  from?: string
  to?: string
  customer_id?: number
  part_id?: number
  status?: string
}

// ---------- Report response shapes ----------

export interface ParetoRow {
  defect_code: string
  count: number
  pct: number
  cumulative_pct: number
}
export interface NcrParetoPayload {
  report: "ncr_pareto"
  title: string
  window: { from: string; to: string }
  total_ncrs: number
  unique_defects: number
  top80_defects_count: number
  rows: ParetoRow[]
  generated_at: string
}

export interface CapaSummaryPayload {
  report: "capa_summary"
  title: string
  window: { from: string; to: string }
  kpi: {
    open_count: number
    closed_count: number
    ineffective_count: number
    overdue_open: number
    avg_days_to_close: number | null
    median_days_to_close: number | null
  }
  monthly: Array<{ month: string; opened: number; closed: number }>
  source_breakdown: Record<string, number>
  generated_at: string
}

export interface GaugeComplianceLocation {
  location: string
  total: number
  current: number
  due: number
  overdue: number
  out_of_service: number
  compliance_pct: number
}
export interface GaugeCompliancePayload {
  report: "gauge_compliance"
  title: string
  window: { from: string; to: string }
  kpi: {
    total_gauges: number
    in_service: number
    current_pct: number
    overdue_count: number
    oot_events: number
  }
  by_location: GaugeComplianceLocation[]
  overdue_list: Array<{
    gauge_id: string
    type: string
    location: string | null
    next_cal_due: string | null
    days_overdue: number | null
  }>
  oot_history: Array<{
    gauge_id: string
    type: string
    disposition: string
    assessed_at: string
    assessor: string
  }>
  generated_at: string
}

export interface FaiStatusRow {
  fai_number: string
  part_number: string | null
  revision: string | null
  customer: string | null
  status: string
  created_at: string
}
export interface FaiStatusPayload {
  report: "fai_status"
  title: string
  window: { from: string; to: string }
  kpi: {
    total: number
    accepted: number
    in_work: number
    submitted: number
    returned: number
    first_pass_rate: number
  }
  by_status: Record<string, number>
  by_customer: Record<string, {
    total: number
    accepted: number
    submitted: number
    returned: number
    in_work: number
  }>
  rows: FaiStatusRow[]
  generated_at: string
}

// ---------- API helpers ----------

function paramsFrom(filters: ReportFilters = {}): Record<string, string> {
  const p: Record<string, string> = {}
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "") p[k] = String(v)
  }
  return p
}

export const apiNcrPareto = (f: ReportFilters = {}) =>
  api.get<NcrParetoPayload>("/reports/ncr-pareto", { params: paramsFrom(f) })

export const apiCapaSummary = (f: ReportFilters = {}) =>
  api.get<CapaSummaryPayload>("/reports/capa-summary", { params: paramsFrom(f) })

export const apiGaugeCompliance = (f: ReportFilters = {}) =>
  api.get<GaugeCompliancePayload>("/reports/gauge-compliance", { params: paramsFrom(f) })

export const apiFaiStatus = (f: ReportFilters = {}) =>
  api.get<FaiStatusPayload>("/reports/fai-status", { params: paramsFrom(f) })

export const apiManagementReview = (f: ReportFilters = {}) =>
  api.get("/reports/management-review", { params: paramsFrom(f) })

export const apiDashboardTiles = () =>
  api.get("/reports/dashboard-tiles")

/**
 * Downloads the PDF for any report as a blob and triggers browser save.
 * Filename comes from the Content-Disposition header when the browser
 * respects it; otherwise falls back to <report_key>_<timestamp>.pdf.
 */
export async function downloadReportPdf(
  reportKey: "ncr-pareto" | "capa-summary" | "gauge-compliance" | "fai-status" | "management-review",
  filters: ReportFilters = {},
): Promise<void> {
  const res = await api.get(`/reports/${reportKey}/pdf`, {
    params: paramsFrom(filters),
    responseType: "blob",
  })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement("a")
  a.href = url
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 15)
  a.download = `${reportKey}_${ts}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
