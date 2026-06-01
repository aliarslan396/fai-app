"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Package, Plus, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight, FileText,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { PartFormDialog, type Part } from "@/components/part-form-dialog"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"

const COLUMNS = ["Part Number", "Rev", "Description", "Customer", "Status", ""]

const statusVariants: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  hold: "outline",
  obsolete: "secondary",
}

export default function PartsPage() {
  const { hasPermission } = useAuthStore()

  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Part | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Part | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canCreate = hasPermission("parts.create")
  const canEdit = hasPermission("parts.edit")
  const canDelete = hasPermission("parts.delete")

  const fetchParts = async (pageNum = 1) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get("/parts", {
        params: {
          page: pageNum,
          search: search || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
          per_page: 25,
        },
      })
      setParts(data.data || [])
      setLastPage(data.last_page || 1)
      setPage(data.current_page || 1)
      setTotal(data.total || 0)
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load parts"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchParts(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const openAdd = () => {
    setEditTarget(null)
    setFormOpen(true)
  }

  const openEdit = (p: Part) => {
    setEditTarget(p)
    setFormOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/parts/${deleteTarget.id}`)
      toast.success(`${deleteTarget.part_number} Rev ${deleteTarget.revision} deleted`)
      setDeleteTarget(null)
      fetchParts(page)
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
          <h1 className="text-2xl font-semibold tracking-tight">Parts</h1>
          <p className="text-sm text-muted-foreground">
            Parts your shop makes — link drawings, plans, and inspections
          </p>
        </div>
        {canCreate && (
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add part
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {loading ? "Loading..." : `${total} part${total !== 1 ? "s" : ""}`}
              </CardTitle>
              <CardDescription>Click a row to open</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Search by part #, rev, or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchParts(1)}
                className="w-72"
                disabled={loading}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                  <SelectItem value="obsolete">Obsolete</SelectItem>
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
              title="Failed to load parts"
              description={error}
              onRetry={() => fetchParts(page)}
            />
          ) : parts.length === 0 ? (
            <EmptyState
              icon={Package}
              title={search ? "No matching parts" : "No parts yet"}
              description={
                search
                  ? "Try a different search term or clear filters."
                  : "Add your first part to start uploading drawings + plans."
              }
              action={
                canCreate && !search
                  ? { label: "Add part", onClick: openAdd, icon: Plus }
                  : undefined
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((c) => (
                      <TableHead key={c}>{c}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parts.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer">
                      <TableCell className="font-mono font-medium">
                        <Link href={`/parts/${p.id}`} className="hover:underline">
                          {p.part_number}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.revision}</TableCell>
                      <TableCell>
                        <Link href={`/parts/${p.id}`} className="hover:underline">
                          {p.description}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.customer ? (
                          <span>
                            {p.customer.name}
                            {p.customer.code && (
                              <span className="ml-1 font-mono text-xs text-muted-foreground">
                                {p.customer.code}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariants[p.status] || "default"}>{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {(canEdit || canDelete) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <DropdownMenuItem asChild>
                                <Link href={`/parts/${p.id}`}>
                                  <FileText className="mr-2 h-4 w-4" />
                                  Open
                                </Link>
                              </DropdownMenuItem>
                              {canEdit && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openEdit(p)
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
                                      setDeleteTarget(p)
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
                      onClick={() => fetchParts(page - 1)}
                      disabled={page <= 1 || loading}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchParts(page + 1)}
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

      <PartFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        part={editTarget}
        onSaved={() => fetchParts(page)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this part?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{deleteTarget?.part_number}</strong> Rev{" "}
              <strong>{deleteTarget?.revision}</strong>. Linked drawings will be deleted too.
              This cannot be undone.
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
