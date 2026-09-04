"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { KpiTile, ReportShell } from "@/components/reports/report-shell"
import { apiGaugeCompliance, type GaugeCompliancePayload, type ReportFilters } from "@/lib/reports"
import { getErrorMessage } from "@/lib/errors"

function complianceTone(pct: number): "green" | "amber" | "red" {
  if (pct >= 95) return "green"
  if (pct >= 85) return "amber"
  return "red"
}

export default function GaugeCompliancePage() {
  const [filters, setFilters] = useState<ReportFilters>({})
  const [data, setData] = useState<GaugeCompliancePayload | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await apiGaugeCompliance(filters)
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
      title="Gauge Compliance"
      subtitle="Calibration currency by location, overdue list, OOT event history"
      reportKey="gauge-compliance"
      filters={filters}
      onFiltersChange={setFilters}
      onReload={load}
      loading={loading}
    >
      {!data ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
            <KpiTile label="Total" value={data.kpi.total_gauges} />
            <KpiTile label="In Service" value={data.kpi.in_service} />
            <KpiTile label="Current %" value={`${data.kpi.current_pct}%`} tone={complianceTone(data.kpi.current_pct)} />
            <KpiTile label="Overdue" value={data.kpi.overdue_count} tone={data.kpi.overdue_count > 0 ? "red" : "default"} />
            <KpiTile label="OOT Events" value={data.kpi.oot_events} tone={data.kpi.oot_events > 0 ? "amber" : "default"} />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Compliance by location</CardTitle>
            </CardHeader>
            <CardContent>
              {data.by_location.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">No gauges registered.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead className="w-16">Total</TableHead>
                      <TableHead className="w-16">Current</TableHead>
                      <TableHead className="w-16">Due</TableHead>
                      <TableHead className="w-16">Overdue</TableHead>
                      <TableHead className="w-16">OOS</TableHead>
                      <TableHead className="w-24">Compliance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.by_location.map((l) => (
                      <TableRow key={l.location}>
                        <TableCell className="font-medium">{l.location}</TableCell>
                        <TableCell>{l.total}</TableCell>
                        <TableCell>{l.current}</TableCell>
                        <TableCell>{l.due}</TableCell>
                        <TableCell>{l.overdue}</TableCell>
                        <TableCell>{l.out_of_service}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            l.compliance_pct >= 95 ? "border-emerald-300 bg-emerald-50 text-emerald-800" :
                            l.compliance_pct >= 85 ? "border-amber-300 bg-amber-50 text-amber-800" :
                            "border-red-300 bg-red-50 text-red-800"
                          }>{l.compliance_pct}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-red-800">Overdue gauges — action required</CardTitle>
            </CardHeader>
            <CardContent>
              {data.overdue_list.length === 0 ? (
                <div className="py-4 text-center text-sm text-emerald-700">All in-service gauges are current.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Gauge ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Days Overdue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.overdue_list.map((g) => (
                      <TableRow key={g.gauge_id}>
                        <TableCell className="font-mono font-medium">{g.gauge_id}</TableCell>
                        <TableCell>{g.type}</TableCell>
                        <TableCell>{g.location ?? "—"}</TableCell>
                        <TableCell>{g.next_cal_due ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800">{g.days_overdue}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent OOT events</CardTitle>
            </CardHeader>
            <CardContent>
              {data.oot_history.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">No OOT assessments in this window.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Gauge</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Disposition</TableHead>
                      <TableHead>Assessed</TableHead>
                      <TableHead>Assessor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.oot_history.map((o, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono">{o.gauge_id}</TableCell>
                        <TableCell>{o.type}</TableCell>
                        <TableCell className="capitalize">{o.disposition.replace(/_/g, " ")}</TableCell>
                        <TableCell>{new Date(o.assessed_at).toLocaleDateString()}</TableCell>
                        <TableCell>{o.assessor}</TableCell>
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
