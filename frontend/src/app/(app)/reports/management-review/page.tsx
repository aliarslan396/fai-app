"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, FileText } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiTile, ReportShell } from "@/components/reports/report-shell"
import { apiManagementReview, type ReportFilters } from "@/lib/reports"
import { getErrorMessage } from "@/lib/errors"

interface ExecPayload {
  report: "management_review_packet"
  title: string
  window: { from: string; to: string }
  exec_summary: {
    total_ncrs: number
    top80_defects_count: number
    capa_open: number
    capa_overdue: number
    gauge_compliance_pct: number
    fai_first_pass_rate: number
  }
  generated_at: string
}

export default function ManagementReviewPage() {
  const [filters, setFilters] = useState<ReportFilters>({})
  const [data, setData] = useState<ExecPayload | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiManagementReview(filters)
      setData(res.data as ExecPayload)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load"))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { void load() }, [])

  return (
    <ReportShell
      title="Management Review Packet"
      subtitle="Quarterly AS9100 §9.3 review evidence — combines NCR, CAPA, Gauge, FAI into one PDF"
      reportKey="management-review"
      filters={filters}
      onFiltersChange={setFilters}
      onReload={load}
      loading={loading}
    >
      {!data ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KpiTile label="Total NCRs" value={data.exec_summary.total_ncrs} />
            <KpiTile label="Defects for 80%" value={data.exec_summary.top80_defects_count} />
            <KpiTile label="Open CAPAs" value={data.exec_summary.capa_open} />
            <KpiTile label="Overdue CAPAs" value={data.exec_summary.capa_overdue} tone="red" />
            <KpiTile label="Gauge Compliance" value={`${data.exec_summary.gauge_compliance_pct}%`} tone={data.exec_summary.gauge_compliance_pct >= 95 ? "green" : "amber"} />
            <KpiTile label="FAI 1st Pass" value={`${data.exec_summary.fai_first_pass_rate}%`} tone={data.exec_summary.fai_first_pass_rate >= 90 ? "green" : "amber"} />
          </div>

          <Card className="border-purple-200 bg-purple-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-purple-900">
                <FileText className="h-4 w-4" />
                Ready for AS9100 §9.3 Management Review
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-purple-900">
              <p>
                Click <strong>Download PDF</strong> above to get the full packet — cover page + all 4 sections
                (NCR Pareto, CAPA Summary, Gauge Compliance, FAI Status) — for the quarterly review meeting.
              </p>
              <p className="text-xs text-purple-800">
                Period: <strong>{data.window.from}</strong> → <strong>{data.window.to}</strong> · Generated {new Date(data.generated_at).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </ReportShell>
  )
}
