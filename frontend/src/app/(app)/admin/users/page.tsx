"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Users, UserPlus, MoreHorizontal, Pencil, Pause, Play, Trash2, AlertTriangle, Loader2,
} from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"

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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { TableSkeleton } from "@/components/table-skeleton"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"
import { InviteUserDialog } from "@/components/invite-user-dialog"
import { EditUserSheet } from "@/components/edit-user-sheet"

interface User {
  id: number
  name: string
  email: string
  phone: string | null
  status: "active" | "disabled" | "pending"
  two_factor_enabled: boolean
  last_login_at: string | null
  created_at: string
  roles: Array<{ name: string }>
}

const statusVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  disabled: "secondary",
  pending: "outline",
}

const COLUMNS = ["User", "Role", "Status", "Last Login", "MFA", ""]

export default function AdminUsersPage() {
  const { hasPermission } = useAuthStore()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [remainingSlots, setRemainingSlots] = useState<number | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const canInvite = hasPermission("users.create")
  const canEdit = hasPermission("users.edit")
  const canDisable = hasPermission("users.disable")
  const canDelete = hasPermission("users.delete")

  const fetchUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get("/users", {
        params: search ? { search } : {},
      })
      setUsers(data.data || [])
      setRemainingSlots(data.remaining_slots ?? null)
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load users"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const disable = async (id: number) => {
    try {
      await api.patch(`/users/${id}/disable`)
      toast.success("User disabled")
      fetchUsers()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to disable"))
    }
  }

  const enable = async (id: number) => {
    try {
      await api.patch(`/users/${id}/enable`)
      toast.success("User enabled")
      fetchUsers()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to enable"))
    }
  }

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === users.length) return new Set()
      return new Set(users.map((u) => u.id))
    })
  }

  const bulkAction = async (action: "disable" | "enable" | "delete") => {
    if (selectedIds.size === 0) return
    if (action === "delete" && !confirm(`Permanently delete ${selectedIds.size} users? This cannot be undone.`)) return

    setBulkBusy(true)
    try {
      const { data } = await api.post("/users/bulk", {
        ids: Array.from(selectedIds),
        action,
      })
      toast.success(data.message)
      setSelectedIds(new Set())
      fetchUsers()
    } catch (err) {
      toast.error(getErrorMessage(err, "Bulk action failed"))
    } finally {
      setBulkBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/users/${deleteTarget.id}`)
      toast.success(`${deleteTarget.name} deleted`)
      setDeleteTarget(null)
      fetchUsers()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete"))
    } finally {
      setDeleting(false)
    }
  }

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "U"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage your team members and their roles
          </p>
        </div>
        {canInvite && (
          <Button onClick={() => setInviteOpen(true)} disabled={remainingSlots === 0}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite user
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {loading ? "Loading..." : `${users.length} user${users.length !== 1 ? "s" : ""}`}
              </CardTitle>
              <CardDescription>
                {remainingSlots !== null
                  ? `${remainingSlots} seat${remainingSlots !== 1 ? "s" : ""} remaining`
                  : "Click a row to edit"}
              </CardDescription>
            </div>
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchUsers()}
              className="max-w-xs"
              disabled={loading}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton columns={COLUMNS} rows={4} />
          ) : error ? (
            <ErrorState
              title="Failed to load users"
              description={error}
              onRetry={fetchUsers}
            />
          ) : users.length === 0 ? (
            <EmptyState
              icon={Users}
              title={search ? "No matching users" : "No users yet"}
              description={
                search
                  ? "Try a different search term."
                  : "Invite your first team member to get started."
              }
              action={
                canInvite
                  ? {
                      label: "Invite user",
                      onClick: () => setInviteOpen(true),
                      icon: UserPlus,
                    }
                  : undefined
              }
            />
          ) : (
            <>
            {selectedIds.size > 0 && (canDisable || canDelete) && (
              <div className="mb-3 flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-2">
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-medium">
                    {selectedIds.size} selected
                  </span>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex gap-2">
                  {canDisable && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => bulkAction("disable")} disabled={bulkBusy}>
                        <Pause className="mr-2 h-3.5 w-3.5" />
                        Disable
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => bulkAction("enable")} disabled={bulkBusy}>
                        <Play className="mr-2 h-3.5 w-3.5" />
                        Enable
                      </Button>
                    </>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="destructive" onClick={() => bulkAction("delete")} disabled={bulkBusy}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  {(canDisable || canDelete) && (
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedIds.size > 0 && selectedIds.size === users.length}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                  )}
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>MFA</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow
                    key={u.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => canEdit && setEditTarget(u)}
                  >
                    {(canDisable || canDelete) && (
                      <TableCell onClick={(e) => e.stopPropagation()} className="w-12">
                        <Checkbox
                          checked={selectedIds.has(u.id)}
                          onCheckedChange={() => toggleOne(u.id)}
                          aria-label={`Select ${u.name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                            {initials(u.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{u.name}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.roles?.[0] ? (
                        <Badge variant="secondary" className="capitalize">
                          {u.roles[0].name.replace("_", " ")}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No role</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[u.status]} className="capitalize">
                        {u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      {u.two_factor_enabled ? (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-700">
                          Enabled
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {(canEdit || canDisable || canDelete) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEdit && (
                            <DropdownMenuItem onClick={() => setEditTarget(u)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {canDisable && (
                            u.status === "active" ? (
                              <DropdownMenuItem onClick={() => disable(u.id)}>
                                <Pause className="mr-2 h-4 w-4" />
                                Disable
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => enable(u.id)}>
                                <Play className="mr-2 h-4 w-4" />
                                Enable
                              </DropdownMenuItem>
                            )
                          )}
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(u)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={fetchUsers}
      />

      <EditUserSheet
        user={editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSuccess={fetchUsers}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes <strong>{deleteTarget?.email}</strong> and all their data.
                  <span className="mt-2 block font-medium text-destructive">
                    This action cannot be undone.
                  </span>
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
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
                  Delete user
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
