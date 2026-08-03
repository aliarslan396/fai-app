"use client"

import { useState } from "react"
import Link from "next/link"
import { Wrench, Plus, Loader2, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CreateGaugeDialog } from "@/components/gauge/create-gauge-dialog"
import { useAuthStore } from "@/lib/auth-store"
import {
  STATUS_COLOR,
  STATUS_LABEL,
  useGauges,
  type GaugeStatus,
} from "@/lib/gauges"

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  } catch {
    return iso
  }
}

export default function GaugesListPage() {
  const { hasPermission } = useAuthStore()
  const canCreate = hasPermission("gauges.create")
  const [statusFilter, setStatusFilter] = useState<GaugeStatus | "">("")
  const [createOpen, setCreateOpen] = useState(false)

  const { gauges, loading, error, refetch } = useGauges({ status: statusFilter })

  const overdueCount = gauges.filter((g) => g.status === "overdue").length
  const dueCount = gauges.filter((g) => g.status === "due").length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Wrench className="h-6 w-6 text-slate-600" />
            Gauge Calibration
          </h1>
          <p className="text-sm text-muted-foreground">
            Central register for every measurement tool. Status auto-computed from calibration schedule.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Gauge
          </Button>
        )}
      </div>

      {(overdueCount > 0 || dueCount > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {overdueCount > 0 && (
            <Card className="border-red-200 bg-red-50/60">
              <CardContent className="flex items-center gap-3 py-3">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <div className="text-sm">
                  <span className="font-semibold text-red-800">{overdueCount}</span> gauge{overdueCount !== 1 ? "s" : ""} overdue for calibration
                </div>
              </CardContent>
            </Card>
          )}
          {dueCount > 0 && (
            <Card className="border-amber-200 bg-amber-50/60">
              <CardContent className="flex items-center gap-3 py-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div className="text-sm">
                  <span className="font-semibold text-amber-800">{dueCount}</span> gauge{dueCount !== 1 ? "s" : ""} due within 14 days
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">All Gauges {gauges.length > 0 && <span className="text-muted-foreground">({gauges.length})</span>}</CardTitle>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : (v as GaugeStatus))}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="current">Current</SelectItem>
                <SelectItem value="due">Due Soon</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="out_of_service">Out of Service</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading gauges…
            </div>
          )}

          {!loading && error && (
            <div className="p-6 text-sm text-destructive">{error}</div>
          )}

          {!loading && !error && gauges.length === 0 && (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No gauges registered yet.
              {canCreate && (
                <>
                  <br />
                  <Button variant="link" size="sm" onClick={() => setCreateOpen(true)}>
                    Add the first gauge →
                  </Button>
                </>
              )}
            </div>
          )}

          {!loading && !error && gauges.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gauge ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Manufacturer / Model</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Last Cal</TableHead>
                  <TableHead>Next Due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gauges.map((g) => (
                  <TableRow key={g.id} className="cursor-pointer">
                    <TableCell className="font-mono font-semibold">
                      <Link href={`/gauges/${g.id}`} className="text-primary hover:underline">
                        {g.gauge_id}
                      </Link>
                    </TableCell>
                    <TableCell>{g.type}</TableCell>
                    <TableCell className="text-xs">
                      {g.manufacturer && <span className="font-medium">{g.manufacturer}</span>}
                      {g.model && <span className="ml-1 text-muted-foreground">{g.model}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{g.range ?? "—"}</TableCell>
                    <TableCell className="text-xs">{g.location ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(g.last_calibrated_at)}</TableCell>
                    <TableCell className="text-xs">
                      <span className={g.status === "overdue" ? "font-semibold text-red-700" : g.status === "due" ? "font-semibold text-amber-700" : "text-muted-foreground"}>
                        {fmtDate(g.next_cal_due)}
                        {g.days_until_due !== null && g.status !== "out_of_service" && (
                          <span className="ml-1">
                            ({g.days_until_due >= 0 ? `${g.days_until_due}d` : `${Math.abs(g.days_until_due)}d over`})
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLOR[g.status]}>
                        {STATUS_LABEL[g.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateGaugeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void refetch()}
      />
    </div>
  )
}
