"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity, AlertTriangle, Building2, ChevronLeft, ChevronRight,
  LogIn, LogOut, Pause, Play, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2, X,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

interface Entry {
  id: number
  action: string
  tenant_id: string | null
  ip_address: string | null
  meta: Record<string, unknown> | null
  created_at: string
  user: { id: number; name: string; email: string } | null
}

interface ActionInfo {
  label: string
  icon: typeof Activity
  color: string
}

interface TenantOption {
  id: string
  name: string
  subdomain: string
}

const ACTION_MAP: Record<string, ActionInfo> = {
  "tenant.created": { label: "Tenant created", icon: Plus, color: "text-emerald-600 bg-emerald-50" },
  "tenant.updated": { label: "Tenant updated", icon: Activity, color: "text-slate-600 bg-slate-100" },
  "tenant.suspended": { label: "Tenant suspended", icon: Pause, color: "text-amber-600 bg-amber-50" },
  "tenant.activated": { label: "Tenant activated", icon: Play, color: "text-emerald-600 bg-emerald-50" },
  "tenant.marked_for_deletion": { label: "Tenant marked for deletion", icon: Trash2, color: "text-rose-600 bg-rose-50" },
  "tenant.restored": { label: "Tenant restored", icon: Play, color: "text-emerald-600 bg-emerald-50" },
  "tenant.purged": { label: "Tenant purged (hard delete)", icon: Trash2, color: "text-destructive bg-destructive/10" },
  "tenant.purge_failed": { label: "Tenant purge failed", icon: AlertTriangle, color: "text-destructive bg-destructive/10" },
  "tenant.deleted": { label: "Tenant deleted", icon: Trash2, color: "text-destructive bg-destructive/10" },
  "master.login.success": { label: "Master signed in", icon: LogIn, color: "text-blue-600 bg-blue-50" },
  "master.login.failed": { label: "Master login failed", icon: AlertTriangle, color: "text-amber-600 bg-amber-50" },
  "master.login.locked": { label: "Master account locked", icon: ShieldAlert, color: "text-destructive bg-destructive/10" },
  "master.logout": { label: "Master signed out", icon: LogOut, color: "text-muted-foreground bg-muted" },
}

const ALL_ACTIONS_VALUE = "__all__"
const ALL_TENANTS_VALUE = "__all__"

function getActionInfo(action: string): ActionInfo {
  return ACTION_MAP[action] || { label: action, icon: Activity, color: "text-muted-foreground bg-muted" }
}

function actionLabel(action: string): string {
  return ACTION_MAP[action]?.label ?? action
}

function formatRelative(iso: string): string {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const DATE_PRESETS: { label: string; days: number | null }[] = [
  { label: "Today", days: 0 },
  { label: "Last 7d", days: 7 },
  { label: "Last 30d", days: 30 },
  { label: "All", days: null },
]

export default function MasterActivityPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [filterTenant, setFilterTenant] = useState<string>(ALL_TENANTS_VALUE)
  const [filterAction, setFilterAction] = useState<string>(ALL_ACTIONS_VALUE)
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")

  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([])
  const [actionOptions, setActionOptions] = useState<string[]>([])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (filterTenant !== ALL_TENANTS_VALUE) n++
    if (filterAction !== ALL_ACTIONS_VALUE) n++
    if (dateFrom) n++
    if (dateTo) n++
    return n
  }, [filterTenant, filterAction, dateFrom, dateTo])

  const fetchLogs = useCallback(
    async (pageNum = 1) => {
      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get("/master/activity", {
          params: {
            page: pageNum,
            per_page: 25,
            tenant_id: filterTenant !== ALL_TENANTS_VALUE ? filterTenant : undefined,
            action: filterAction !== ALL_ACTIONS_VALUE ? filterAction : undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
          },
        })
        setEntries(data.data || [])
        setLastPage(data.last_page || 1)
        setPage(data.current_page || 1)
        setTotal(data.total ?? (data.data?.length || 0))
      } catch (err) {
        setError(getErrorMessage(err, "Failed to load activity"))
      } finally {
        setLoading(false)
      }
    },
    [filterTenant, filterAction, dateFrom, dateTo],
  )

  // Refetch on any filter change
  useEffect(() => {
    void fetchLogs(1)
  }, [fetchLogs])

  // Fetch dropdown options once
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.get("/master/tenants", { params: { per_page: 200 } })
        setTenantOptions(
          (data.data || []).map((t: TenantOption) => ({
            id: t.id,
            name: t.name,
            subdomain: t.subdomain,
          })),
        )
      } catch {
        // Not fatal — tenant dropdown just shows nothing
      }
      try {
        const { data } = await api.get("/master/activity/actions")
        setActionOptions(data.actions || [])
      } catch {
        // Not fatal — action dropdown falls back to hardcoded ACTION_MAP keys
        setActionOptions(Object.keys(ACTION_MAP))
      }
    })()
  }, [])

  const applyPreset = (days: number | null) => {
    if (days === null) {
      setDateFrom("")
      setDateTo("")
    } else if (days === 0) {
      const t = todayIso()
      setDateFrom(t)
      setDateTo(t)
    } else {
      setDateFrom(daysAgoIso(days))
      setDateTo(todayIso())
    }
  }

  const clearAllFilters = () => {
    setFilterTenant(ALL_TENANTS_VALUE)
    setFilterAction(ALL_ACTIONS_VALUE)
    setDateFrom("")
    setDateTo("")
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground">
            Platform-wide audit log across all tenants
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchLogs(page)} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFilterCount} active
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Narrow the feed by tenant, action, or date range.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="f_tenant" className="text-xs uppercase tracking-wide text-muted-foreground">
                Tenant
              </Label>
              <Select value={filterTenant} onValueChange={setFilterTenant}>
                <SelectTrigger id="f_tenant">
                  <SelectValue placeholder="All tenants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TENANTS_VALUE}>All tenants</SelectItem>
                  {tenantOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}{" "}
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        {t.subdomain}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f_action" className="text-xs uppercase tracking-wide text-muted-foreground">
                Action
              </Label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger id="f_action">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ACTIONS_VALUE}>All actions</SelectItem>
                  {actionOptions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {actionLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f_from" className="text-xs uppercase tracking-wide text-muted-foreground">
                From
              </Label>
              <Input
                id="f_from"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f_to" className="text-xs uppercase tracking-wide text-muted-foreground">
                To
              </Label>
              <Input
                id="f_to"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                max={todayIso()}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Quick range
            </span>
            {DATE_PRESETS.map((p) => (
              <Button key={p.label} variant="outline" size="sm" onClick={() => applyPreset(p.days)}>
                {p.label}
              </Button>
            ))}
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-muted-foreground"
              >
                <X className="mr-1 h-3 w-3" />
                Clear all filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            {loading ? "Loading..." : `${total.toLocaleString()} event${total === 1 ? "" : "s"}`}
          </CardTitle>
          <CardDescription>Most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <ErrorState
              title="Failed to load activity"
              description={error}
              onRetry={() => fetchLogs(page)}
            />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={Activity}
              title={activeFilterCount > 0 ? "No events match these filters" : "No activity yet"}
              description={
                activeFilterCount > 0
                  ? "Try widening the date range or clearing a filter."
                  : "Platform events will appear here as tenants are created and managed."
              }
              action={
                activeFilterCount > 0
                  ? { label: "Clear filters", onClick: clearAllFilters, icon: X }
                  : undefined
              }
            />
          ) : (
            <>
              <ul className="space-y-1">
                {entries.map((e) => {
                  const info = getActionInfo(e.action)
                  const Icon = info.icon
                  return (
                    <li
                      key={e.id}
                      className="flex items-start gap-3 rounded-md px-3 py-3 hover:bg-muted/50"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${info.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium">{info.label}</span>
                          <span
                            className="shrink-0 text-xs text-muted-foreground"
                            title={new Date(e.created_at).toLocaleString()}
                          >
                            {formatRelative(e.created_at)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {e.tenant_id && (
                            <span className="flex items-center gap-1 font-mono">
                              <Building2 className="h-3 w-3" />
                              {e.tenant_id}
                            </span>
                          )}
                          {e.user && (
                            <>
                              <span>·</span>
                              <span>{e.user.name}</span>
                            </>
                          )}
                          {e.ip_address && (
                            <>
                              <span>·</span>
                              <span className="font-mono">{e.ip_address}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>

              {lastPage > 1 && (
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {lastPage}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchLogs(page - 1)}
                      disabled={page <= 1 || loading}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchLogs(page + 1)}
                      disabled={page >= lastPage || loading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
