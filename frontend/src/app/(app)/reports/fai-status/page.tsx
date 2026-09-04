"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { KpiTile, ReportShell } from "@/components/reports/report-shell"
import { apiFaiStatus, type FaiStatusPayload, type ReportFilters } from "@/lib/reports"
import { getErrorMessage } from "@/lib/errors"

const STATUS_STYLE: Record<string, string> = {
  accepted: "border-emerald-300 bg-emerald-50 text-emerald-800",
  submitted: "border-blue-300 bg-blue-50 text-blue-800",
  returned: "border-red-300 bg-red-50 text-red-800",
  in_work: "border-slate-300 bg-slate-100 text-slate-800",
}

export default function FaiStatusPage() {
  const [filters, setFilters] = useState<ReportFilters>({})
  const [data, setData] = useState<FaiStatusPayload | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await apiFaiStatus(filters)
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
      title="FAI Status"
      subtitle="AS9102 first-article submissions — first-pass acceptance rate and per-customer breakdown"
      reportKey="fai-status"
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
            <KpiTile label="Total" value={data.kpi.total} />
            <KpiTile label="Accepted" value={data.kpi.accepted} tone="green" />
            <KpiTile label="In Work" value={data.kpi.in_work} />
            <KpiTile label="Submitted" value={data.kpi.submitted} tone="blue" />
            <KpiTile label="Returned" value={data.kpi.returned} tone="red" />
            <KpiTile label="1st Pass %" value={`${data.kpi.first_pass_rate}%`} tone={data.kpi.first_pass_rate >= 90 ? "green" : "amber"} />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">By customer</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(data.by_customer).length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">No FAIs in this window.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="w-16 text-right">Total</TableHead>
                      <TableHead className="w-20 text-right">Accepted</TableHead>
                      <TableHead className="w-20 text-right">Submitted</TableHead>
                      <TableHead className="w-20 text-right">Returned</TableHead>
                      <TableHead className="w-16 text-right">In Work</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(data.by_customer).map(([customer, s]) => (
                      <TableRow key={customer}>
                        <TableCell className="font-medium">{customer}</TableCell>
                        <TableCell className="text-right">{s.total}</TableCell>
                        <TableCell className="text-right">{s.accepted}</TableCell>
                        <TableCell className="text-right">{s.submitted}</TableCell>
                        <TableCell className="text-right">{s.returned}</TableCell>
                        <TableCell className="text-right">{s.in_work}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">FAI list</CardTitle>
            </CardHeader>
            <CardContent>
              {data.rows.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">—</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>FAI #</TableHead>
                      <TableHead>Part</TableHead>
                      <TableHead className="w-16">Rev</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-28">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((r) => (
                      <TableRow key={r.fai_number}>
                        <TableCell className="font-mono font-medium">{r.fai_number}</TableCell>
                        <TableCell>{r.part_number ?? "—"}</TableCell>
                        <TableCell>{r.revision ?? "—"}</TableCell>
                        <TableCell>{r.customer ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_STYLE[r.status] ?? ""}>
                            {r.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{r.created_at}</TableCell>
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
