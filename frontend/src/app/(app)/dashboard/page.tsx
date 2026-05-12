"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/empty-state"
import { useAuthStore } from "@/lib/auth-store"
import { FileText, Stamp, AlertTriangle, Wrench, Activity, Inbox, Plus } from "lucide-react"

const stats = [
  { label: "Active Inspections", value: "0", icon: Stamp, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "Open NCRs", value: "0", icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "Inspection Plans", value: "0", icon: FileText, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "Gauges Due", value: "0", icon: Wrench, color: "text-rose-600", bg: "bg-rose-50" },
]

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {user?.name?.split(" ")[0]}
          </p>
        </div>
        <div className="flex gap-2">
          {user?.roles?.map((r) => (
            <Badge key={r.name} variant="secondary" className="capitalize">
              {r.name.replace("_", " ")}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <div className={`flex h-8 w-8 items-center justify-center rounded-md ${stat.bg}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stat.value}</div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
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
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Inbox}
                title="No inspections yet"
                description="Start your first inspection by creating an inspection plan."
                action={{ label: "Create plan", onClick: () => {}, icon: Plus }}
              />
            )}
          </CardContent>
        </Card>

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
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Inbox}
                title="All clear"
                description="No pending actions. Great work."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
