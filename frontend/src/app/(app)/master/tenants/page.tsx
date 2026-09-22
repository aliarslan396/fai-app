"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Building2, ExternalLink, Eye, Loader2, MoreHorizontal, Pause, Play, Trash2, AlertTriangle, Plus, Copy, Check } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { TableSkeleton } from "@/components/table-skeleton"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { tenantUrl, tenantDisplayHost } from "@/lib/url"

interface Tenant {
  id: string
  name: string
  slug: string
  subdomain: string
  status: "trial" | "active" | "suspended" | "cancelled"
  user_limit: number
  trial_ends_at: string | null
  deleted_at: string | null
  purge_at: string | null
  created_at: string
  counts?: { users: number; plans: number; drawings: number }
}

const statusVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  trial: "outline",
  active: "default",
  suspended: "secondary",
  cancelled: "destructive",
}

const COLUMNS = ["Company", "Subdomain", "Status", "Users", "Plans", "Drawings", "Created", ""]

export default function MasterTenantsPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [provisionOpen, setProvisionOpen] = useState(false)
  const [provisionForm, setProvisionForm] = useState({
    company_name: "",
    subdomain: "",
    admin_name: "",
    admin_email: "",
    admin_password: "",
  })
  const [provisionSaving, setProvisionSaving] = useState(false)
  const [provisionResult, setProvisionResult] = useState<
    | { admin_email: string; admin_password: string; login_url: string; email_sent: boolean }
    | null
  >(null)
  const [copied, setCopied] = useState<"password" | "url" | null>(null)

  const fetchTenants = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get("/master/tenants", {
        params: search ? { search } : {},
      })
      setTenants(data.data || [])
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load tenants"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTenants()
  }, [])

  const suspend = async (id: string) => {
    try {
      await api.patch(`/master/tenants/${id}/suspend`)
      toast.success("Tenant suspended")
      fetchTenants()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to suspend"))
    }
  }

  const activate = async (id: string) => {
    try {
      await api.patch(`/master/tenants/${id}/activate`)
      toast.success("Tenant activated")
      fetchTenants()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to activate"))
    }
  }

  const restore = async (id: string) => {
    try {
      await api.patch(`/master/tenants/${id}/restore`)
      toast.success("Tenant restored")
      fetchTenants()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to restore"))
    }
  }

  // Generate a strong random password so admin doesn't have to invent one.
  // Uses crypto.getRandomValues for cryptographic-grade entropy (browser).
  const generatePassword = (): string => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*"
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
  }

  const openProvision = () => {
    setProvisionForm({
      company_name: "",
      subdomain: "",
      admin_name: "",
      admin_email: "",
      admin_password: generatePassword(),
    })
    setProvisionResult(null)
    setProvisionOpen(true)
  }

  const submitProvision = async () => {
    setProvisionSaving(true)
    try {
      const { data } = await api.post("/master/tenants", provisionForm)
      toast.success(`${provisionForm.company_name} provisioned`)
      setProvisionResult({
        admin_email: data.admin_email,
        admin_password: provisionForm.admin_password,
        login_url: data.login_url,
        email_sent: Boolean(data.email_sent),
      })
      fetchTenants()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to provision tenant"))
    } finally {
      setProvisionSaving(false)
    }
  }

  const copyToClipboard = async (text: string, which: "password" | "url") => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error("Copy failed")
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/master/tenants/${deleteTarget.id}`)
      toast.success(`${deleteTarget.name} deleted`)
      setDeleteTarget(null)
      fetchTenants()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete"))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-sm text-muted-foreground">All companies using FAI</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.open("/signup", "_blank")}>
            Open signup page
          </Button>
          <Button onClick={openProvision}>
            <Plus className="mr-2 h-4 w-4" />
            Provision tenant
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {loading ? "Loading..." : `${tenants.length} tenant${tenants.length !== 1 ? "s" : ""}`}
              </CardTitle>
              <CardDescription>Click a row to manage</CardDescription>
            </div>
            <Input
              placeholder="Search by name or subdomain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchTenants()}
              className="max-w-xs"
              disabled={loading}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton columns={COLUMNS} rows={5} />
          ) : error ? (
            <ErrorState
              title="Failed to load tenants"
              description={error}
              onRetry={fetchTenants}
            />
          ) : tenants.length === 0 ? (
            <EmptyState
              icon={Building2}
              title={search ? "No matching tenants" : "No tenants yet"}
              description={
                search
                  ? "Try a different search term or clear the filter."
                  : "Share your signup link with prospects to onboard their workspace."
              }
              action={
                search
                  ? { label: "Clear search", onClick: () => { setSearch(""); fetchTenants() } }
                  : { label: "Open signup page", onClick: () => window.open("/signup", "_blank"), icon: Plus }
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Subdomain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Plans</TableHead>
                  <TableHead className="text-right">Drawings</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/master/tenants/${t.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.slug}</div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <a
                        href={tenantUrl(t.subdomain)}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 font-mono text-sm text-primary hover:underline"
                      >
                        {tenantDisplayHost(t.subdomain)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[t.status]} className="capitalize">
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <span className="tabular-nums">{t.counts?.users ?? 0}</span>
                      <span className="text-muted-foreground"> / {t.user_limit}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {(t.counts?.plans ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {(t.counts?.drawings ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/master/tenants/${t.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {t.status === "cancelled" && t.deleted_at ? (
                            <DropdownMenuItem onClick={() => restore(t.id)}>
                              <Play className="mr-2 h-4 w-4" />
                              Restore
                            </DropdownMenuItem>
                          ) : t.status === "active" || t.status === "trial" ? (
                            <>
                              <DropdownMenuItem onClick={() => suspend(t.id)}>
                                <Pause className="mr-2 h-4 w-4" />
                                Suspend
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(t)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Mark for deletion
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={() => activate(t.id)}>
                                <Play className="mr-2 h-4 w-4" />
                                Activate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(t)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Mark for deletion
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={provisionOpen}
        onOpenChange={(o) => {
          if (provisionSaving) return
          setProvisionOpen(o)
          if (!o) setProvisionResult(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {provisionResult ? "Tenant ready" : "Provision new tenant"}
            </DialogTitle>
            <DialogDescription>
              {provisionResult
                ? provisionResult.email_sent
                  ? "Invite email sent to the admin. Copy the credentials below as a backup — the password is not shown again."
                  : "Email delivery failed — copy the credentials below and send them to the admin manually."
                : "Creates a tenant DB, seeds roles + permissions, creates the first admin user, and emails them the login link."}
            </DialogDescription>
          </DialogHeader>

          {!provisionResult ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="company_name">Company name</Label>
                <Input
                  id="company_name"
                  value={provisionForm.company_name}
                  onChange={(e) => setProvisionForm((f) => ({ ...f, company_name: e.target.value }))}
                  placeholder="Acme Aerospace"
                  disabled={provisionSaving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subdomain">Subdomain</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="subdomain"
                    value={provisionForm.subdomain}
                    onChange={(e) =>
                      setProvisionForm((f) => ({
                        ...f,
                        subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                      }))
                    }
                    placeholder="acme"
                    disabled={provisionSaving}
                    className="font-mono"
                  />
                  <span className="whitespace-nowrap text-sm text-muted-foreground">.admicomhub.com</span>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="admin_name">Admin name</Label>
                  <Input
                    id="admin_name"
                    value={provisionForm.admin_name}
                    onChange={(e) => setProvisionForm((f) => ({ ...f, admin_name: e.target.value }))}
                    placeholder="Jane Smith"
                    disabled={provisionSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin_email">Admin email</Label>
                  <Input
                    id="admin_email"
                    type="email"
                    value={provisionForm.admin_email}
                    onChange={(e) => setProvisionForm((f) => ({ ...f, admin_email: e.target.value }))}
                    placeholder="jane@acme.com"
                    disabled={provisionSaving}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin_password">Admin password (auto-generated)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="admin_password"
                    value={provisionForm.admin_password}
                    onChange={(e) => setProvisionForm((f) => ({ ...f, admin_password: e.target.value }))}
                    className="font-mono"
                    disabled={provisionSaving}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setProvisionForm((f) => ({ ...f, admin_password: generatePassword() }))}
                    disabled={provisionSaving}
                  >
                    Regenerate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Copy this and send it to the admin securely.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div
                className={
                  provisionResult.email_sent
                    ? "flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
                    : "flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                }
              >
                {provisionResult.email_sent ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <span>
                  {provisionResult.email_sent
                    ? "Invite email delivered."
                    : "Email delivery failed — relay credentials manually."}
                </span>
              </div>
              <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Admin email</div>
                <div className="font-mono">{provisionResult.admin_email}</div>
              </div>
              <div className="space-y-2 rounded-lg border bg-amber-50 p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-amber-800">One-time password</div>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-sm">{provisionResult.admin_password}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(provisionResult.admin_password, "password")}
                  >
                    {copied === "password" ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Login URL</div>
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={provisionResult.login_url}
                    target="_blank"
                    rel="noopener"
                    className="truncate font-mono text-sm text-primary hover:underline"
                  >
                    {provisionResult.login_url}
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(provisionResult.login_url, "url")}
                  >
                    {copied === "url" ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {!provisionResult ? (
              <>
                <Button variant="outline" onClick={() => setProvisionOpen(false)} disabled={provisionSaving}>
                  Cancel
                </Button>
                <Button
                  onClick={submitProvision}
                  disabled={
                    provisionSaving ||
                    !provisionForm.company_name ||
                    !provisionForm.subdomain ||
                    !provisionForm.admin_name ||
                    !provisionForm.admin_email ||
                    provisionForm.admin_password.length < 8
                  }
                >
                  {provisionSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Provisioning...
                    </>
                  ) : (
                    "Provision"
                  )}
                </Button>
              </>
            ) : (
              <Button onClick={() => setProvisionOpen(false)}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <AlertDialogTitle>Mark {deleteTarget?.name} for deletion?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    All users are locked out immediately. The tenant DB is retained for a
                    <strong> 30-day grace period</strong> — you can Restore any time before then.
                  </span>
                  <span className="block">
                    After 30 days the DB and every drawing, plan, and audit record is
                    permanently dropped.
                  </span>
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          {deleteTarget && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Company</span>
                <span className="font-medium">{deleteTarget.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subdomain</span>
                <span className="font-mono">{deleteTarget.subdomain}.localhost</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Database</span>
                <span className="font-mono text-xs">tenant{deleteTarget.id}</span>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Marking...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Mark for deletion
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>          
    </div>
  )
}
