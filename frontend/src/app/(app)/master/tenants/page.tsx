"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Building2, ExternalLink, Eye, Loader2, MoreHorizontal, Pause, Play, Trash2, AlertTriangle, Plus } from "lucide-react"

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
import { TableSkeleton } from "@/components/table-skeleton"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

interface Tenant {
  id: string
  name: string
  slug: string
  subdomain: string
  status: "trial" | "active" | "suspended" | "cancelled"
  user_limit: number
  trial_ends_at: string | null
  created_at: string
}

const statusVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  trial: "outline",
  active: "default",
  suspended: "secondary",
  cancelled: "destructive",
}

const COLUMNS = ["Company", "Subdomain", "Status", "User Limit", "Created", ""]

export default function MasterTenantsPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null)
  const [deleting, setDeleting] = useState(false)

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
        <Button onClick={() => window.open("/signup", "_blank")} variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Invite to signup
        </Button>
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
                  <TableHead>User Limit</TableHead>
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
                        href={`http://${t.subdomain}.localhost:3000`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 font-mono text-sm text-primary hover:underline"
                      >
                        {t.subdomain}.localhost
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[t.status]} className="capitalize">
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{t.user_limit}</TableCell>
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
                          {t.status === "active" || t.status === "trial" ? (
                            <DropdownMenuItem onClick={() => suspend(t.id)}>
                              <Pause className="mr-2 h-4 w-4" />
                              Suspend
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => activate(t.id)}>
                              <Play className="mr-2 h-4 w-4" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(t)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete tenant
                          </DropdownMenuItem>
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

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    This permanently deletes the tenant and drops their entire database.
                  </span>
                  <span className="block font-medium text-destructive">
                    This action cannot be undone.
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
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete tenant
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>          
    </div>
  )
}
