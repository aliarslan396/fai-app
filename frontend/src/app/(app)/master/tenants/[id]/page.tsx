"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft, Building2, Users, Activity, Calendar, ExternalLink,
  Pause, Play, Trash2, AlertTriangle, Loader2,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { resolveAssetUrl } from "@/lib/tenant"

interface Tenant {
  id: string
  name: string
  slug: string
  subdomain: string
  logo_url: string | null
  primary_color: string
  status: "trial" | "active" | "suspended" | "cancelled"
  user_limit: number
  trial_ends_at: string | null
  created_at: string
  domains?: Array<{ id: number; domain: string }>
}

interface AuditEntry {
  id: number
  action: string
  ip_address: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

interface TenantDetail {
  tenant: Tenant
  stats: {
    user_count: number
    last_activity: string | null
  }
  audit_logs: AuditEntry[]
}

const statusVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  trial: "outline",
  active: "default",
  suspended: "secondary",
  cancelled: "destructive",
}

export default function TenantDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id

  const [data, setData] = useState<TenantDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get(`/master/tenants/${id}`)
      setData(data)
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load tenant"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) fetchData()
  }, [id])

  const suspend = async () => {
    setBusy(true)
    try {
      await api.patch(`/master/tenants/${id}/suspend`)
      toast.success("Tenant suspended")
      fetchData()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to suspend"))
    } finally {
      setBusy(false)
    }
  }

  const activate = async () => {
    setBusy(true)
    try {
      await api.patch(`/master/tenants/${id}/activate`)
      toast.success("Tenant activated")
      fetchData()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to activate"))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.delete(`/master/tenants/${id}`)
      toast.success("Tenant deleted")
      router.push("/master/tenants")
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete"))
      setBusy(false)
    }
  }

  if (loading) return <DetailSkeleton />

  if (error || !data) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.push("/master/tenants")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to tenants
        </Button>
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {error || "Tenant not found"}
          </CardContent>
        </Card>
      </div>
    )
  }

  const { tenant, stats, audit_logs } = data
  const logoSrc = resolveAssetUrl(tenant.logo_url)
  const isActive = tenant.status === "active" || tenant.status === "trial"

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push("/master/tenants")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to tenants
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={tenant.name}
              className="h-16 w-16 rounded-lg border bg-white object-contain p-2"
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-lg text-2xl font-bold text-white"
              style={{ backgroundColor: tenant.primary_color }}
            >
              {tenant.name[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
              <Badge variant={statusVariants[tenant.status]} className="capitalize">
                {tenant.status}
              </Badge>
            </div>
            <a
              href={`http://${tenant.subdomain}.localhost:3000`}
              target="_blank"
              rel="noopener"
              className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
            >
              {tenant.subdomain}.localhost
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div className="flex gap-2">
          {isActive ? (
            <Button variant="outline" onClick={suspend} disabled={busy}>
              <Pause className="mr-2 h-4 w-4" /> Suspend
            </Button>
          ) : (
            <Button onClick={activate} disabled={busy}>
              <Play className="mr-2 h-4 w-4" /> Activate
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Users"
          value={`${stats.user_count} / ${tenant.user_limit}`}
          color="text-blue-600 bg-blue-50"
        />
        <StatCard
          icon={Activity}
          label="Last Login"
          value={stats.last_activity ? new Date(stats.last_activity).toLocaleString() : "Never"}
          color="text-emerald-600 bg-emerald-50"
        />
        <StatCard
          icon={Calendar}
          label="Created"
          value={new Date(tenant.created_at).toLocaleDateString()}
          color="text-purple-600 bg-purple-50"
        />
        <StatCard
          icon={AlertTriangle}
          label="Trial Ends"
          value={tenant.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString() : "—"}
          color="text-amber-600 bg-amber-50"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Workspace Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Workspace ID" value={tenant.id} mono />
            <Row label="Slug" value={tenant.slug} mono />
            <Row label="Subdomain" value={tenant.subdomain} mono />
            <Row label="Database" value={`tenant${tenant.id}`} mono />
            <Row
              label="Primary color"
              value={
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-4 w-4 rounded border"
                    style={{ backgroundColor: tenant.primary_color }}
                  />
                  <span className="font-mono">{tenant.primary_color}</span>
                </span>
              }
            />
            <Row label="User limit" value={tenant.user_limit.toString()} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Master-level events for this tenant</CardDescription>
          </CardHeader>
          <CardContent>
            {audit_logs.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                No activity yet
              </div>
            ) : (
              <ul className="space-y-3">
                {audit_logs.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 border-b pb-3 last:border-0 last:pb-0">
                    <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{formatAction(entry.action)}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                        {entry.ip_address && ` · ${entry.ip_address}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <AlertDialogTitle>Delete {tenant.name}?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    This permanently deletes the tenant and drops their database. All users, data,
                    and settings will be lost.
                  </span>
                  <span className="block font-medium text-destructive">
                    This action cannot be undone.
                  </span>
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); remove() }}
              disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete tenant
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    "tenant.created": "Tenant created",
    "tenant.suspended": "Tenant suspended",
    "tenant.activated": "Tenant activated",
    "tenant.deleted": "Tenant deleted",
    "master.login.success": "Master admin signed in",
    "master.login.failed": "Master login failed",
    "master.login.locked": "Master account locked",
    "master.logout": "Master signed out",
  }
  return map[action] || action
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users
  label: string
  value: string
  color: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={`flex h-8 w-8 items-center justify-center rounded-md ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-lg font-semibold truncate">{value}</div>
      </CardContent>
    </Card>
  )
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</span>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-32" />
      <div className="flex gap-4">
        <Skeleton className="h-16 w-16 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
