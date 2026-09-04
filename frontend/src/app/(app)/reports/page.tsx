"use client"

import Link from "next/link"
import { AlertOctagon, BarChart3, CheckCircle2, ClipboardList, FileText, GitBranch, Wrench } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Report selector — landing page listing every AS9100 §9.3 report the
 * QA Manager can pull. Each card links to its own filter/preview page
 * with a Download PDF action.
 */
const REPORTS = [
  {
    href: "/reports/management-review",
    icon: FileText,
    title: "Management Review Packet",
    description: "The quarterly AS9100 §9.3 packet — combines NCR Pareto, CAPA Summary, Gauge Compliance, and FAI Status into one PDF for the review meeting.",
    color: "text-purple-700",
    bg: "bg-purple-50",
  },
  {
    href: "/reports/ncr-pareto",
    icon: AlertOctagon,
    title: "NCR Pareto",
    description: "Defect-code frequency with cumulative %. Shows which few defects account for the bulk of NCRs — where to focus corrective action.",
    color: "text-red-700",
    bg: "bg-red-50",
  },
  {
    href: "/reports/capa-summary",
    icon: GitBranch,
    title: "CAPA Summary",
    description: "Open vs closed by month, average days to close, source breakdown, overdue open CAPAs — corrective action program health.",
    color: "text-blue-700",
    bg: "bg-blue-50",
  },
  {
    href: "/reports/gauge-compliance",
    icon: Wrench,
    title: "Gauge Compliance",
    description: "Calibration currency by location, overdue gauge list, OOT event history — the AS9100 §7.1.5 measurement resources evidence.",
    color: "text-amber-700",
    bg: "bg-amber-50",
  },
  {
    href: "/reports/fai-status",
    icon: ClipboardList,
    title: "FAI Status",
    description: "AS9102 first-article submissions filtered by date, status, and customer. First-pass acceptance rate + per-customer breakdown.",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
  },
]

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BarChart3 className="h-6 w-6 text-slate-600" />
          Reports
        </h1>
        <p className="text-sm text-muted-foreground">
          AS9100 §9.3 Management Review evidence. Each report exports to PDF for review meetings and auditor handoff.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => {
          const Icon = r.icon
          return (
            <Link key={r.href} href={r.href}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${r.bg}`}>
                      <Icon className={`h-5 w-5 ${r.color}`} />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-base">{r.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{r.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
