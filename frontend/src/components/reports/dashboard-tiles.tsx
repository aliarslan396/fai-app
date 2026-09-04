"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertOctagon, Wrench, GitBranch, ClipboardCheck, Loader2 } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { apiDashboardTiles } from "@/lib/reports"

interface TilesPayload {
  ncr_pareto_top: Array<{ defect_code: string; count: number; pct: number }>
  capa_kpi: {
    open_count: number
    closed_count: number
    overdue_open: number
    avg_days_to_close: number | null
  }
  gauge_kpi: {
    total_gauges: number
    in_service: number
    current_pct: number
    overdue_count: number
    oot_events: number
  }
  fai_kpi: {
    total: number
    accepted: number
    in_work: number
    submitted: number
    returned: number
    first_pass_rate: number
  }
}

/**
 * 3 mini KPI cards + 3 mini charts per doc §4.8, pulled from the
 * /reports/dashboard-tiles endpoint. Everything is inline SVG / CSS
 * — no chart library dependency so this stays cheap.
 */
export function DashboardChartTiles() {
  const [data, setData] = useState<TilesPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiDashboardTiles()
      .then((res) => setData(res.data as TilesPayload))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) return null

  // Compute FAI pipeline pcts for the horizontal bars
  const faiTotal = Math.max(1, data.fai_kpi.total)
  const faiSteps = [
    { label: "In Work", n: data.fai_kpi.in_work, color: "#94a3b8" },
    { label: "Submitted", n: data.fai_kpi.submitted, color: "#3b82f6" },
    { label: "Returned", n: data.fai_kpi.returned, color: "#ef4444" },
    { label: "Accepted", n: data.fai_kpi.accepted, color: "#10b981" },
  ]

  return (
    <div className="space-y-4">
      {/* 3 KPI mini cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniKpi
          label="CAPAs On-Time"
          value={onTimePct(data.capa_kpi)}
          suffix="%"
          icon={GitBranch}
          tone={onTimePct(data.capa_kpi) >= 90 ? "green" : "amber"}
          href="/reports/capa-summary"
        />
        <MiniKpi
          label="Gauge Compliance"
          value={data.gauge_kpi.current_pct}
          suffix="%"
          icon={Wrench}
          tone={data.gauge_kpi.current_pct >= 95 ? "green" : "amber"}
          href="/reports/gauge-compliance"
        />
        <MiniKpi
          label="FAI 1st-Pass"
          value={data.fai_kpi.first_pass_rate}
          suffix="%"
          icon={ClipboardCheck}
          tone={data.fai_kpi.first_pass_rate >= 90 ? "green" : "amber"}
          href="/reports/fai-status"
        />
      </div>

      {/* 3 mini charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* FAI pipeline — horizontal bars */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">FAI Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {data.fai_kpi.total === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No FAIs.</div>
            ) : (
              faiSteps.map((s) => (
                <div key={s.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{s.label}</span>
                    <span className="font-mono">{s.n}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-muted">
                    <div className="h-full transition-all" style={{ width: `${(s.n / faiTotal) * 100}%`, background: s.color }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* NCR Pareto top 5 — mini bar list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1">
              <AlertOctagon className="h-3.5 w-3.5 text-red-600" />
              Top NCR Defects (30d)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {data.ncr_pareto_top.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No NCRs.</div>
            ) : (
              data.ncr_pareto_top.map((r) => (
                <div key={r.defect_code} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-mono">{r.defect_code}</span>
                    <span className="font-mono text-muted-foreground">{r.count} · {r.pct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-muted">
                    <div className="h-full bg-red-500" style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Gauge donut — inline SVG */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Gauge Status</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <GaugeDonut kpi={data.gauge_kpi} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/**
 * "On-time" for CAPAs = share of open CAPAs NOT overdue.
 * If everything is closed, treat as 100.
 */
function onTimePct(kpi: TilesPayload["capa_kpi"]): number {
  if (kpi.open_count === 0) return 100
  const onTime = kpi.open_count - kpi.overdue_open
  return Math.round((onTime / kpi.open_count) * 100)
}

function MiniKpi({
  label,
  value,
  suffix,
  icon: Icon,
  tone,
  href,
}: {
  label: string
  value: number | string
  suffix?: string
  icon: React.ComponentType<{ className?: string }>
  tone: "green" | "amber" | "red" | "blue"
  href: string
}) {
  const toneMap = {
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-700",
    blue: "text-blue-700",
  }
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-center justify-between py-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={`text-2xl font-bold ${toneMap[tone]}`}>
              {value}
              {suffix ?? ""}
            </div>
          </div>
          <Icon className={`h-5 w-5 ${toneMap[tone]}`} />
        </CardContent>
      </Card>
    </Link>
  )
}

/**
 * Compact donut chart drawn as an SVG so we don't need a chart lib.
 * Slices: current · due · overdue · out-of-service.
 */
function GaugeDonut({ kpi }: { kpi: TilesPayload["gauge_kpi"] }) {
  const total = kpi.total_gauges
  if (total === 0) {
    return <div className="py-4 text-center text-xs text-muted-foreground">No gauges.</div>
  }

  const current = kpi.in_service - kpi.overdue_count // approximation: current + due lumped
  const overdue = kpi.overdue_count
  const oos = total - kpi.in_service

  const slices = [
    { label: "Current / Due", n: current, color: "#10b981" },
    { label: "Overdue", n: overdue, color: "#ef4444" },
    { label: "Out of Service", n: oos, color: "#94a3b8" },
  ].filter((s) => s.n > 0)

  const radius = 40
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="14" />
        {slices.map((s, i) => {
          const dash = (s.n / total) * circumference
          const gap = circumference - dash
          const strokeDashoffset = -offset
          offset += dash
          return (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={strokeDashoffset}
            />
          )
        })}
      </svg>
      <div className="flex-1 space-y-1 text-xs">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span>{s.label}</span>
            </div>
            <span className="font-mono">{s.n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
