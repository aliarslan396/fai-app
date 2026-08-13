"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Trash2, Pencil, Info } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

type PartType = "raw" | "sub" | "assembly" | "finish"

interface IndexRow {
  id: number
  field15_part_number: string
  field16_part_name: string | null
  field17_part_type: PartType | null
  field18_fair_identifier: string | null
  sort_order: number
}

interface Props {
  formId: number
  locked: boolean
  canEdit: boolean
}

const PART_TYPE_LABEL: Record<PartType, string> = {
  raw: "Raw material",
  sub: "Sub-component",
  assembly: "Sub-assembly",
  finish: "Finished part",
}

/**
 * AS9102 Form 1 — Assembly Index (fields 15-18) per doc 3.4.
 *
 * A list of sub-assemblies / parent references used at manufacture.
 * Standalone piece parts leave this blank; assemblies list their
 * sub-components (one row each). Boeing/Lockheed FAIR packages
 * require this traceability chain.
 *
 * Rows are locked once the parent Form 1 is signed + locked, matching
 * the AS9100 audit-trail rule elsewhere in the app.
 */
export function AssemblyIndexPanel({ formId, locked, canEdit }: Props) {
  const [rows, setRows] = useState<IndexRow[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<IndexRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<IndexRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<{ form1: { indexRows?: IndexRow[]; index_rows?: IndexRow[] } }>(
        `/fai/${formId}`,
      )
      // Backend Eloquent serializes hasMany as camelCase indexRows on the
      // model; keep a fallback for snake in case a serializer changes.
      const list = data.form1.indexRows ?? data.form1.index_rows ?? []
      setRows(list)
    } catch {
      // silent — panel just shows empty state
    } finally {
      setLoading(false)
    }
  }, [formId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/fai/${formId}/index/${deleteTarget.id}`)
      toast.success("Row removed")
      setDeleteTarget(null)
      await refetch()
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete failed"))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Assembly Index (Fields 15-18)</div>
          <div className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              List parent assembly OR sub-components used to build this part. Leave
              empty if this is a standalone piece part (allowed per AS9102).
            </span>
          </div>
        </div>
        {canEdit && !locked && (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add row
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No assembly rows.
          {locked
            ? " Form is locked — cannot add."
            : canEdit
              ? " Add rows if this part has a parent or sub-components."
              : ""}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">#</TableHead>
              <TableHead>Field 15 · Part #</TableHead>
              <TableHead>Field 16 · Part Name</TableHead>
              <TableHead>Field 17 · Type</TableHead>
              <TableHead>Field 18 · FAIR Ref</TableHead>
              {canEdit && !locked && <TableHead className="w-[100px] text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-mono text-sm">{r.field15_part_number}</TableCell>
                <TableCell className="text-sm">{r.field16_part_name ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  {r.field17_part_type ? PART_TYPE_LABEL[r.field17_part_type] : "—"}
                </TableCell>
                <TableCell className="font-mono text-sm">{r.field18_fair_identifier ?? "—"}</TableCell>
                {canEdit && !locked && (
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => setEditTarget(r)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(r)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AddOrEditDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        formId={formId}
        mode="add"
        onSaved={() => {
          setAddOpen(false)
          void refetch()
        }}
      />
      {editTarget && (
        <AddOrEditDialog
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
          formId={formId}
          mode="edit"
          existing={editTarget}
          onSaved={() => {
            setEditTarget(null)
            void refetch()
          }}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove index row?</AlertDialogTitle>
            <AlertDialogDescription>
              Field 15 = <span className="font-mono">{deleteTarget?.field15_part_number}</span>.
              This action is audit-logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface DialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  formId: number
  mode: "add" | "edit"
  existing?: IndexRow
  onSaved: () => void
}

function AddOrEditDialog({ open, onOpenChange, formId, mode, existing, onSaved }: DialogProps) {
  const [f15, setF15] = useState(existing?.field15_part_number ?? "")
  const [f16, setF16] = useState(existing?.field16_part_name ?? "")
  const [f17, setF17] = useState<PartType | "">(existing?.field17_part_type ?? "")
  const [f18, setF18] = useState(existing?.field18_fair_identifier ?? "")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setF15(existing?.field15_part_number ?? "")
      setF16(existing?.field16_part_name ?? "")
      setF17(existing?.field17_part_type ?? "")
      setF18(existing?.field18_fair_identifier ?? "")
    }
  }, [open, existing])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f15.trim()) {
      toast.error("Field 15 (Part #) is required")
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        field15_part_number: f15.trim(),
        field16_part_name: f16.trim() || null,
        field17_part_type: f17 || null,
        field18_fair_identifier: f18.trim() || null,
      }
      if (mode === "add") {
        await api.post(`/fai/${formId}/index`, payload)
        toast.success("Row added")
      } else if (existing) {
        await api.patch(`/fai/${formId}/index/${existing.id}`, payload)
        toast.success("Row updated")
      }
      onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err, "Save failed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Assembly Index Row" : "Edit Row"}</DialogTitle>
          <DialogDescription>
            Field 15 is required. Others are optional per AS9102 Rev C.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="f15">
              Field 15 — Part Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="f15"
              value={f15}
              onChange={(e) => setF15(e.target.value)}
              placeholder="985YG0261-501"
              disabled={submitting}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="f16">Field 16 — Part Name</Label>
            <Input
              id="f16"
              value={f16}
              onChange={(e) => setF16(e.target.value)}
              placeholder="Spreader Bar Assembly"
              disabled={submitting}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="f17">Field 17 — Part Type</Label>
              <Select
                value={f17 || undefined}
                onValueChange={(v) => setF17(v as PartType)}
                disabled={submitting}
              >
                <SelectTrigger id="f17" className="w-full">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PART_TYPE_LABEL) as PartType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {PART_TYPE_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="f18">Field 18 — FAIR Reference</Label>
              <Input
                id="f18"
                value={f18}
                onChange={(e) => setF18(e.target.value)}
                placeholder="FAIR-2026-0100"
                disabled={submitting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              {mode === "add" ? "Add Row" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
