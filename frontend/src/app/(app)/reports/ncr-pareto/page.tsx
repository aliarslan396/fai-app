"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { InlineBar, KpiTile, ReportShell } from "@/components/reports/report-shell"
import { apiNcrPareto, type NcrParetoPayload, type ReportFilters } from "@/lib/reports"
import { getErrorMessage } from "@/lib/errors"

export default function NcrParetoPage() {
  const [filters, setFilters] = useState<ReportFilters>({})
  const [data, setData] = useState<NcrParetoPayload | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await apiNcrPareto(filters)
      setData(data)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load"))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { void load() }, [])

  return (
    <ReportShell
      title="NCR Pareto"
      subtitle="Defect frequency with cumulative % — the 80/20 view of non-conformances"
      reportKey="ncr-pareto"
      filters={filters}
      onFiltersChange={setFilters}
      onReload={load}
      loading={loading}
    >
      {!data ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <KpiTile label="Total NCRs" value={data.total_ncrs} />
            <KpiTile label="Unique Defects" value={data.unique_defects} />
            <KpiTile label="Defects for 80%" value={data.top80_defects_count} tone="red" />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Defects ranked by frequency</CardTitle>
            </CardHeader>
            <CardContent>
              {data.rows.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No NCRs in this window.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Defect Code</TableHead>
                      <TableHead className="w-16">Count</TableHead>
                      <TableHead>Share</TableHead>
                      <TableHead className="w-20 text-right">%</TableHead>
                      <TableHead className="w-24 text-right">Cumulative</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((r, i) => (
                      <TableRow key={r.defect_code}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-mono font-medium">{r.defect_code}</TableCell>
                        <TableCell>{r.count}</TableCell>
                        <TableCell><InlineBar pct={r.pct * 2} /></TableCell>
                        <TableCell className="text-right">{r.pct}%</TableCell>
                        <TableCell className="text-right font-semibold">{r.cumulative_pct}%</TableCell>
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
