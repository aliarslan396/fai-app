"use client"

import { useEffect, useState } from "react"
import { Activity, AlertTriangle, ChevronLeft, ChevronRight, LogIn, LogOut, ShieldAlert, ShieldCheck, UserCog, UserPlus, UserX } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

interface AuditEntry {
  id: number
  action: string
  ip_address: string | null
  user_agent: string | null
  meta: Record<string, unknown> | null
  created_at: string
  user: {
    id: number
    name: string
    email: string
  } | null
}

interface ActionInfo {
  label: string
  icon: typeof Activity
  color: string
}

const ACTION_MAP: Record<string, ActionInfo> = {
  "login.success": { label: "Signed in", icon: LogIn, color: "text-emerald-600 bg-emerald-50" },
  "login.failed": { label: "Failed login", icon: AlertTriangle, color: "text-amber-600 bg-amber-50" },
  "login.locked": { label: "Account locked", icon: ShieldAlert, color: "text-destructive bg-destructive/10" },
  "logout": { label: "Signed out", icon: LogOut, color: "text-muted-foreground bg-muted" },
  "user.created": { label: "User created", icon: UserPlus, color: "text-blue-600 bg-blue-50" },
  "user.updated": { label: "User updated", icon: UserCog, color: "text-blue-600 bg-blue-50" },
  "user.disabled": { label: "User disabled", icon: UserX, color: "text-amber-600 bg-amber-50" },
  "user.enabled": { label: "User enabled", icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50" },
  "user.deleted": { label: "User deleted", icon: UserX, color: "text-destructive bg-destructive/10" },
  "password.reset.requested": { label: "Password reset requested", icon: ShieldCheck, color: "text-blue-600 bg-blue-50" },
  "password.reset.completed": { label: "Password reset done", icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50" },
  "mfa.enabled": { label: "MFA enabled", icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50" },
  "mfa.disabled": { label: "MFA disabled", icon: ShieldAlert, color: "text-amber-600 bg-amber-50" },
  "mfa.verify.success": { label: "MFA verified", icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50" },
  "mfa.verify.failed": { label: "MFA failed", icon: AlertTriangle, color: "text-amber-600 bg-amber-50" },
  "tenant.settings.updated": { label: "Settings updated", icon: UserCog, color: "text-blue-600 bg-blue-50" },
  "tenant.logo.uploaded": { label: "Logo uploaded", icon: UserCog, color: "text-blue-600 bg-blue-50" },
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

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [search, setSearch] = useState("")

  const fetchLogs = async (pageNum = 1) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get("/audit-logs", {
        params: { page: pageNum, action: search || undefined, per_page: 25 },
      })
      setEntries(data.data || [])
      setLastPage(data.last_page || 1)
      setPage(data.current_page || 1)
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load audit log"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "?"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity Log</h1>
        <p className="text-sm text-muted-foreground">
          Every action taken in your workspace
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
              <CardDescription>
                Logins, user changes, settings updates
              </CardDescription>
            </div>
            <Input
              placeholder="Filter by action (e.g. login, user, mfa)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchLogs(1)}
              className="max-w-xs"
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
              title={search ? "No matching activity" : "No activity yet"}
              description={
                search
                  ? "Try a different search term."
                  : "Activity will appear here as users interact with the workspace."
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
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatRelative(e.created_at)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          {e.user ? (
                            <span className="flex items-center gap-1.5">
                              <Avatar className="h-4 w-4">
                                <AvatarFallback className="text-[8px]">
                                  {initials(e.user.name)}
                                </AvatarFallback>
                              </Avatar>
                              {e.user.name}
                            </span>
                          ) : (
                            <span>System</span>
                          )}
                          {e.ip_address && (
                            <>
                              <span>·</span>
                              <span className="font-mono">{e.ip_address}</span>
                            </>
                          )}
                          {typeof e.meta?.email === "string" && (
                            <>
                              <span>·</span>
                              <span>{e.meta.email}</span>
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
