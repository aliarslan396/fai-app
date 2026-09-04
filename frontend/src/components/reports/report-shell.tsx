"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Download, Filter, Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { downloadReportPdf, type ReportFilters } from "@/lib/reports"
import { getErrorMessage } from "@/lib/errors"

interface Props {
  title: string
  subtitle: string
  reportKey: "ncr-pareto" | "capa-summary" | "gauge-compliance" | "fai-status" | "management-review"
  defaultFrom?: string
  defaultTo?: string
  extraFilters?: React.ReactNode
  filters: ReportFilters
  onFiltersChange: (f: ReportFilters) => void
  onReload: () => void
  loading: boolean
  children: React.ReactNode
}

/**
 * Common frame for every report page — back button, title, date-range
 * filter, refresh + download-PDF actions. Each report page slots its
 * charts + tables into `children`.
 */
export function ReportShell({
  title,
  subtitle,
  reportKey,
  extraFilters,
  filters,
  onFiltersChange,
  onReload,
  loading,
  children,
}: Props) {
  const router = useRouter()
  const [downloading, setDownloading] = useState(false)

  async function handlePdf() {
    setDownloading(true)
    try {
      await downloadReportPdf(reportKey, filters)
      toast.success("PDF downloaded")
    } catch (err) {
      toast.error(getErrorMessage(err, "PDF failed"))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/reports")} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Reports
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReload} disabled={loading}>
            {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Refresh
          </Button>
          <Button size="sm" onClick={handlePdf} disabled={downloading || loading}>
            {downloading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
            Download PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="from" className="flex items-center gap-1 text-xs">
                <Filter className="h-3 w-3" /> From
              </Label>
              <Input
                id="from"
                type="date"
                value={filters.from ?? ""}
                onChange={(e) => onFiltersChange({ ...filters, from: e.target.value })}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to" className="text-xs">To</Label>
              <Input
                id="to"
                type="date"
                value={filters.to ?? ""}
                onChange={(e) => onFiltersChange({ ...filters, to: e.target.value })}
                className="w-40"
              />
            </div>
            {extraFilters}
            <Button size="sm" onClick={onReload} disabled={loading}>Apply</Button>
          </div>
        </CardContent>
      </Card>

      {children}
    </div>
  )
}

/** Compact KPI tile used inside a KpiRow. */
export function KpiTile({ label, value, tone = "default" }: {
  label: string
  value: string | number | null | undefined
  tone?: "default" | "green" | "amber" | "red" | "blue"
}) {
  const toneMap: Record<string, string> = {
    default: "text-foreground",
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-700",
    blue: "text-blue-700",
  }
  return (
    <Card>
      <CardContent className="py-3 text-center">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${toneMap[tone]}`}>{value ?? "—"}</div>
      </CardContent>
    </Card>
  )
}

/** Horizontal CSS bar used in Pareto + monthly breakdowns. */
export function InlineBar({ pct, color = "#1F4E79" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-muted">
      <div className="h-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}
