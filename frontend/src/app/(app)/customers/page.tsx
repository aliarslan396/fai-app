"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Building2, Plus, MoreHorizontal, Pencil, Trash2, Power, ChevronLeft, ChevronRight,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { CustomerFormDialog, type Customer } from "@/components/customer-form-dialog"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"

const COLUMNS = ["Name", "Code", "Contact", "Country", "Status", ""]

export default function CustomersPage() {
  const { hasPermission } = useAuthStore()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const canCreate = hasPermission("customers.create")
  const canEdit = hasPermission("customers.edit")
  const canDelete = hasPermission("customers.delete")

  const fetchCustomers = async (pageNum = 1) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get("/customers", {
        params: {
          page: pageNum,
          search: search || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
          per_page: 25,
        },
      })
      setCustomers(data.data || [])
      setLastPage(data.last_page || 1)
      setPage(data.current_page || 1)
      setTotal(data.total || 0)
      setSelectedIds(new Set())
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load customers"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomers(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const openAdd = () => {
    setEditTarget(null)
    setFormOpen(true)
  }

  const openEdit = (c: Customer) => {
    setEditTarget(c)
    setFormOpen(true)
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
      if (prev.size === customers.length) return new Set()
      return new Set(customers.map((c) => c.id))
    })
  }

  const bulkAction = async (action: "activate" | "deactivate" | "delete") => {
    if (selectedIds.size === 0) return
    if (action === "delete" && !confirm(`Delete ${selectedIds.size} customer(s)? Linked parts will block deletion.`)) {
      return
    }
    setBulkBusy(true)
    try {
      const { data } = await api.post("/customers/bulk", {
        ids: Array.from(selectedIds),
        action,
      })
      toast.success(data.message)
      if (data.failed?.length) {
        data.failed.forEach((f: { name: string; error: string }) =>
          toast.error(`${f.name}: ${f.error}`)
        )
      }
      setSelectedIds(new Set())
      fetchCustomers(page)
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
      await api.delete(`/customers/${deleteTarget.id}`)
      toast.success(`${deleteTarget.name} deleted`)
      setDeleteTarget(null)
      fetchCustomers(page)
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
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Companies that buy parts from your shop
          </p>
        </div>
        {canCreate && (
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add customer
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {loading ? "Loading..." : `${total} customer${total !== 1 ? "s" : ""}`}
              </CardTitle>
              <CardDescription>Click a row to edit</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Search name, code, contact..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchCustomers(1)}
                className="w-64"
                disabled={loading}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton columns={COLUMNS} rows={5} />
          ) : error ? (
            <ErrorState
              title="Failed to load customers"
              description={error}
              onRetry={() => fetchCustomers(page)}
            />
          ) : customers.length === 0 ? (
            <EmptyState
              icon={Building2}
              title={search ? "No matching customers" : "No customers yet"}
              description={
                search
                  ? "Try a different search term or clear filters."
                  : "Add your first customer to start linking parts."
              }
              action={
                canCreate && !search
                  ? {
                      label: "Add customer",
                      onClick: openAdd,
                      icon: Plus,
                    }
                  : undefined
              }
            />
          ) : (
            <>
              {selectedIds.size > 0 && (canEdit || canDelete) && (
                <div className="mb-3 flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-2">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-medium">{selectedIds.size} selected</span>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {canEdit && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => bulkAction("activate")} disabled={bulkBusy}>
                          Activate
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => bulkAction("deactivate")} disabled={bulkBusy}>
                          Deactivate
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
                    {(canEdit || canDelete) && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedIds.size > 0 && selectedIds.size === customers.length}
                          onCheckedChange={toggleAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                    )}
                    {COLUMNS.map((col) => (
                      <TableHead key={col}>{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button, [role='checkbox']")) return
                        if (canEdit) openEdit(c)
                      }}
                    >
                      {(canEdit || canDelete) && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={() => toggleOne(c.id)}
                            aria-label={`Select ${c.name}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {c.code || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{c.contact_name || "—"}</div>
                        {c.contact_email && (
                          <div className="text-xs text-muted-foreground">{c.contact_email}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{c.country || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === "active" ? "default" : "secondary"}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {(canEdit || canDelete) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              {canEdit && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openEdit(c)
                                  }}
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                              )}
                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setDeleteTarget(c)
                                    }}
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

              {lastPage > 1 && (
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {lastPage}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchCustomers(page - 1)}
                      disabled={page <= 1 || loading}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchCustomers(page + 1)}
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

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editTarget}
        onSaved={() => fetchCustomers(page)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this customer?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{deleteTarget?.name}</strong>. Will fail if any parts
              are linked. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
