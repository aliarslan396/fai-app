"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { InlineBar, KpiTile, ReportShell } from "@/components/reports/report-shell"
import { apiCapaSummary, type CapaSummaryPayload, type ReportFilters } from "@/lib/reports"
import { getErrorMessage } from "@/lib/errors"

export default function CapaSummaryPage() {
  const [filters, setFilters] = useState<ReportFilters>({})
  const [data, setData] = useState<CapaSummaryPayload | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await apiCapaSummary(filters)
      setData(data)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load"))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { void load() }, [])

  const peak = data ? Math.max(1, ...data.monthly.map((m) => Math.max(m.opened, m.closed))) : 1

  return (
    <ReportShell
      title="CAPA Summary"
      subtitle="Open vs closed trend, avg days to close, source breakdown"
      reportKey="capa-summary"
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
            <KpiTile label="Open" value={data.kpi.open_count} />
            <KpiTile label="Closed" value={data.kpi.closed_count} tone="green" />
            <KpiTile label="Overdue Open" value={data.kpi.overdue_open} tone="red" />
            <KpiTile label="Ineffective" value={data.kpi.ineffective_count} tone="amber" />
            <KpiTile label="Avg Days" value={data.kpi.avg_days_to_close ?? "—"} />
            <KpiTile label="Median Days" value={data.kpi.median_days_to_close ?? "—"} />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Monthly volume</CardTitle>
            </CardHeader>
            <CardContent>
              {data.monthly.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No activity.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Month</TableHead>
                      <TableHead className="w-20">Opened</TableHead>
                      <TableHead className="w-20">Closed</TableHead>
                      <TableHead>Bar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.monthly.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell className="font-mono">{m.month}</TableCell>
                        <TableCell>{m.opened}</TableCell>
                        <TableCell>{m.closed}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <InlineBar pct={(m.opened / peak) * 100} color="#1F4E79" />
                            <InlineBar pct={(m.closed / peak) * 100} color="#10b981" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-4 rounded" style={{ background: "#1F4E79" }} /> Opened</span>
                <span className="flex items-center gap-1"><span className="h-2 w-4 rounded" style={{ background: "#10b981" }} /> Closed</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Source breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(data.source_breakdown).length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">—</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="w-20 text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(data.source_breakdown).map(([src, count]) => (
                      <TableRow key={src}>
                        <TableCell className="capitalize">{src.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-right">{count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </ReportShell>
  )
}
