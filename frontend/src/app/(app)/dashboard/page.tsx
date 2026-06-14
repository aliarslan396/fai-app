"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Stamp, AlertTriangle, FileText, Wrench, Activity, Inbox, Plus,
  ChevronRight, Loader2,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/empty-state"
import { useAuthStore } from "@/lib/auth-store"
import api from "@/lib/api"

interface Kpis {
  active_inspections: number
  completed_inspections: number
  open_ncrs: number
  inspection_plans: number
  gauges_due: number
}

interface RecentSession {
  id: number
  session_type: "as9102" | "custom"
  current_step: number
  step6_complete: boolean
  fai_id?: number | null
  updated_at: string
  part: { id: number; part_number: string; revision: string; description: string } | null
  plan: { id: number; plan_number: string; plan_name: string } | null
  creator: { id: number; name: string } | null
}

interface PendingAction {
  id: number
  kind: string
  label: string
  detail: string
  href: string
}

interface DashboardData {
  kpis: Kpis
  recent_inspections: RecentSession[]
  pending_actions: PendingAction[]
  scope: "org" | "self"
}

const STEP_LABEL = ["Part", "Plan", "Start", "Actuals", "Sign", "Export"]

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuthStore()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const canCreateInspection = hasPermission("inspections.create")

  useEffect(() => {
    api
      .get("/dashboard")
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const kpis = data?.kpis

  const stats = [
    {
      label: "Active Inspections",
      value: kpis?.active_inspections ?? 0,
      icon: Stamp,
      color: "text-blue-600",
      bg: "bg-blue-50",
      href: "/inspections",
    },
    {
      label: "Open NCRs",
      value: kpis?.open_ncrs ?? 0,
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-50",
      href: "/ncr",
    },
    {
      label: "Inspection Plans",
      value: kpis?.inspection_plans ?? 0,
      icon: FileText,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      href: "/parts",
    },
    {
      label: "Gauges Due",
      value: kpis?.gauges_due ?? 0,
      icon: Wrench,
      color: "text-rose-600",
      bg: "bg-rose-50",
      href: "/gauges",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {user?.name?.split(" ")[0]}
            {data && (
              <span className="ml-2 text-xs">
                ({data.scope === "org" ? "viewing org-wide" : "viewing your work"})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user?.roles?.map((r) => (
            <Badge key={r.name} variant="secondary" className="capitalize">
              {r.name.replace("_", " ")}
            </Badge>
          ))}
          {canCreateInspection && (
            <Button asChild size="sm">
              <Link href="/workflow/start">
                <Plus className="mr-1 h-4 w-4" />
                New inspection
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-md ${stat.bg}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-9 w-12" />
                  ) : (
                    <div className="text-3xl font-bold">{stat.value}</div>
                  )}
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Inspections */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Inspections
            </CardTitle>
            <CardDescription>Latest inspection activity</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !data?.recent_inspections || data.recent_inspections.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No inspections yet"
                description="Start your first inspection to see it here."
                action={
                  canCreateInspection
                    ? {
                        label: "New inspection",
                        onClick: () => (window.location.href = "/workflow/start"),
                        icon: Plus,
                      }
                    : undefined
                }
              />
            ) : (
              <ul className="space-y-1">
                {data.recent_inspections.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={
                        s.step6_complete
                          ? "/inspections"
                          : s.current_step <= 2
                            ? "/workflow/start"
                            : s.current_step >= 4
                              ? (s.session_type === "as9102"
                                  ? `/inspections/${s.id}/form3`
                                  : `/inspections/${s.id}/custom-report`)
                              : `/workflow/new-inspection/${s.id}`
                      }
                      className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <Stamp className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium">
                            {s.part ? `${s.part.part_number} Rev ${s.part.revision}` : "(part removed)"}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {relativeTime(s.updated_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="uppercase text-[10px]">
                            {s.session_type}
                          </Badge>
                          <span>
                            {s.step6_complete
                              ? "Completed"
                              : `Step ${s.current_step}/6 — ${STEP_LABEL[s.current_step - 1]}`}
                          </span>
                          {s.creator?.name && (
                            <>
                              <span>·</span>
                              <span>{s.creator.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pending Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Pending Actions
            </CardTitle>
            <CardDescription>Items requiring your attention</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !data?.pending_actions || data.pending_actions.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="All clear"
                description="No pending actions. Great work."
              />
            ) : (
              <ul className="space-y-1">
                {data.pending_actions.map((a) => (
                  <li key={`${a.kind}-${a.id}`}>
                    <Link
                      href={a.href}
                      className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{a.label}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{a.detail}</div>
                      </div>
                      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
