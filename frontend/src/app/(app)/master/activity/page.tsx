"use client"

import { useEffect, useState } from "react"
import {
  Activity, AlertTriangle, Building2, ChevronLeft, ChevronRight,
  LogIn, LogOut, Pause, Play, Plus, ShieldAlert, ShieldCheck, Trash2,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
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

function getActionInfo(action: string): ActionInfo {
  return ACTION_MAP[action] || { label: action, icon: Activity, color: "text-muted-foreground bg-muted" }
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

export default function MasterActivityPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [filterTenant, setFilterTenant] = useState("")

  const fetchLogs = async (pageNum = 1) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get("/master/activity", {
        params: {
          page: pageNum,
          tenant_id: filterTenant || undefined,
          per_page: 25,
        },
      })
      setEntries(data.data || [])
      setLastPage(data.last_page || 1)
      setPage(data.current_page || 1)
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load activity"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide audit log across all tenants
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent activity
              </CardTitle>
              <CardDescription>Master-level events</CardDescription>
            </div>
            <Input
              placeholder="Filter by tenant ID (e.g. acme)..."
              value={filterTenant}
              onChange={(e) => setFilterTenant(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchLogs(1)}
              className="max-w-xs font-mono text-sm"
              disabled={loading}
            />
          </div>
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
              title="No activity yet"
              description="Platform events will appear here as tenants are created and managed."
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
                          <span className="shrink-0 text-xs text-muted-foreground">
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
