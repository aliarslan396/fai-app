"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft, Pencil, Upload, FileText, Trash2, Loader2, Download, AlertTriangle,
  ClipboardList, Plus, RotateCw,
} from "lucide-react"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
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
import { PartFormDialog, type Part } from "@/components/part-form-dialog"
import { PlanFormDialog, type InspectionPlan } from "@/components/plan-form-dialog"
import { AuthImage } from "@/components/auth-image"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"

interface Drawing {
  id: number
  original_filename: string
  drawing_number: string | null
  revision: string | null
  page_count: number
  status: "pending" | "uploaded" | "processing" | "processed" | "failed"
  file_size: number
  processing_error: string | null
  created_at: string
  updated_at: string
  uploader: { id: number; name: string; email: string } | null
}

const ACCEPTED = ".pdf,.png,.jpg,.jpeg,.tif,.tiff"
const MAX_BYTES = 50 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const statusVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  processed: "default",
  processing: "outline",
  pending: "outline",
  uploaded: "outline",
  failed: "destructive",
}

export default function PartDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { hasPermission } = useAuthStore()

  const [part, setPart] = useState<Part | null>(null)
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [plans, setPlans] = useState<InspectionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [planFormOpen, setPlanFormOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Drawing | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canEdit = hasPermission("parts.edit")
  const canUpload = hasPermission("drawings.upload")
  const canDelete = hasPermission("drawings.delete")
  const canCreatePlan = hasPermission("plans.create")
  const canViewPlan = hasPermission("plans.view")

  const fetchPart = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [partRes, drawingRes, planRes] = await Promise.all([
        api.get(`/parts/${params.id}`),
        api.get("/drawings", { params: { part_id: params.id, per_page: 100 } }),
        api.get("/plans", { params: { part_id: params.id, per_page: 50 } }).catch(() => ({ data: { data: [] } })),
      ])
      setPart(partRes.data.part)
      setDrawings(drawingRes.data.data || [])
      setPlans(planRes.data.data || [])
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load part"))
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchPart()
  }, [fetchPart])

  // Poll while any drawing is still being rendered by the queue worker.
  // Backend flips status pending -> processing -> processed | failed.
  useEffect(() => {
    const hasWorkInFlight = drawings.some(
      (d) => d.status === "pending" || d.status === "processing" || d.status === "uploaded"
    )
    if (!hasWorkInFlight) return
    const t = setInterval(() => { fetchPart() }, 3000)
    return () => clearInterval(t)
  }, [drawings, fetchPart])

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !part) return

    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: too large (>50 MB)`)
        continue
      }

      setUploading(true)
      const formData = new FormData()
      formData.append("part_id", String(part.id))
      formData.append("file", file)

      try {
        await api.post("/drawings", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 180_000,
        })
        toast.success(`${file.name} uploaded — rendering in background`)
      } catch (err) {
        toast.error(getErrorMessage(err, `${file.name} failed`))
      } finally {
        setUploading(false)
      }
    }
    fetchPart()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const confirmDeleteDrawing = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/drawings/${deleteTarget.id}`)
      toast.success("Drawing deleted")
      setDeleteTarget(null)
      fetchPart()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete"))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !part) {
    return (
      <ErrorState
        title="Failed to load part"
        description={error || "Not found"}
        onRetry={fetchPart}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/parts")} className="mb-2 -ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Parts
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {part.part_number} <span className="text-muted-foreground">Rev {part.revision}</span>
            </h1>
            <p className="mt-1 text-base text-foreground">{part.description}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {part.customer && (
                <span>
                  Customer: <strong>{part.customer.name}</strong>
                </span>
              )}
              {part.material && <span>Material: {part.material}</span>}
              {part.process && <span>Process: {part.process}</span>}
              {part.classification && <span>Class: {part.classification}</span>}
              <Badge variant={part.status === "active" ? "default" : "secondary"}>
                {part.status}
              </Badge>
            </div>
          </div>
          {canEdit && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="plans">
        <TabsList>
          {canViewPlan && (
            <TabsTrigger value="plans">
              <ClipboardList className="mr-2 h-4 w-4" />
              Inspection Plans ({plans.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="drawings">
            <FileText className="mr-2 h-4 w-4" />
            Drawings ({drawings.length})
          </TabsTrigger>
        </TabsList>

        {canViewPlan && (
          <TabsContent value="plans">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Inspection Plans</h2>
                    <p className="text-sm text-muted-foreground">
                      Bubble prints with characteristics — reused across all inspections of this part
                    </p>
                  </div>
                  {canCreatePlan && (
                    <Button onClick={() => setPlanFormOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      New plan
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {plans.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="No inspection plans yet"
                    description="Create a plan to start placing balloons + capturing dimensions."
                    action={
                      canCreatePlan
                        ? { label: "New plan", onClick: () => setPlanFormOpen(true), icon: Plus }
                        : undefined
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {plans.map((p) => (
                      <PlanCard key={p.id} plan={p} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="drawings">

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Drawings</h2>
              <p className="text-sm text-muted-foreground">
                Upload TIF, PDF, JPG, or PNG drawings (max 50 MB)
              </p>
            </div>
            {canUpload && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  multiple
                  hidden
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload drawing
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {drawings.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No drawings yet"
              description="Upload the engineering drawing to start FAI inspection planning."
              action={
                canUpload
                  ? {
                      label: "Upload drawing",
                      onClick: () => fileInputRef.current?.click(),
                      icon: Upload,
                    }
                  : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {drawings.map((d) => (
                <DrawingCard
                  key={d.id}
                  drawing={d}
                  onDelete={canDelete ? () => setDeleteTarget(d) : undefined}
                  onRetry={canUpload ? async () => {
                    try {
                      await api.post(`/drawings/${d.id}/retry`)
                      toast.success("Reprocessed")
                      fetchPart()
                    } catch (err) {
                      toast.error(getErrorMessage(err, "Retry failed"))
                    }
                  } : undefined}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>

      <PartFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        part={part}
        onSaved={fetchPart}
      />

      <PlanFormDialog
        open={planFormOpen}
        onOpenChange={setPlanFormOpen}
        partId={part.id}
        onSaved={fetchPart}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete drawing?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.original_filename}</strong> and all{" "}
              {deleteTarget?.page_count} rendered pages will be removed. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteDrawing}
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

async function downloadDrawing(drawing: Drawing) {
  try {
    const res = await api.get(`/drawings/${drawing.id}/download`, { responseType: "blob" })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement("a")
    a.href = url
    a.download = drawing.original_filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (err) {
    toast.error(getErrorMessage(err, "Download failed"))
  }
}

function DrawingCard({
  drawing,
  onDelete,
  onRetry,
}: {
  drawing: Drawing
  onDelete?: () => void
  onRetry?: () => void | Promise<void>
}) {
  const [retrying, setRetrying] = useState(false)
  const showThumb = drawing.status === "processed" && drawing.page_count > 0

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md">
      <Link
        href={`/drawings/${drawing.id}`}
        className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted"
      >
        {showThumb ? (
          <AuthImage
            src={`/drawings/${drawing.id}/pages/1/thumbnail`}
            alt={drawing.original_filename}
            className="h-full w-full object-contain transition-transform group-hover:scale-105"
          />
        ) : drawing.status === "failed" ? (
          <div className="flex flex-col items-center gap-2 p-4 text-destructive">
            <AlertTriangle className="h-8 w-8" />
            <span className="text-xs font-medium">Processing failed</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-xs">Processing...</span>
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/drawings/${drawing.id}`}
            className="line-clamp-2 text-sm font-medium hover:underline"
            title={drawing.original_filename}
          >
            {drawing.original_filename}
          </Link>
          <Badge variant={statusVariants[drawing.status] || "outline"} className="shrink-0">
            {drawing.status}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {drawing.page_count} {drawing.page_count === 1 ? "page" : "pages"} ·{" "}
            {formatBytes(drawing.file_size)}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Download original"
              onClick={() => downloadDrawing(drawing)}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            {onRetry && (drawing.status === "failed" || (
              (drawing.status === "processing" || drawing.status === "pending") &&
              (Date.now() - new Date(drawing.updated_at).getTime()) > 3 * 60 * 1000
            )) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-amber-600 hover:text-amber-700"
                disabled={retrying}
                title="Retry processing"
                onClick={async () => {
                  setRetrying(true)
                  try { await onRetry() } finally { setRetrying(false) }
                }}
              >
                {retrying
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RotateCw className="h-3.5 w-3.5" />}
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={onDelete}
                title="Delete drawing"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        {drawing.status === "failed" && drawing.processing_error && (
          <p className="line-clamp-2 text-xs text-destructive">{drawing.processing_error}</p>
        )}
      </div>
    </div>
  )
}

const planStatusVariant: Record<string, "default" | "secondary" | "outline"> = {
  draft: "outline",
  active: "default",
  superseded: "secondary",
}

function PlanCard({ plan }: { plan: InspectionPlan }) {
  const balloons = plan.balloons_count ?? plan.balloon_count ?? 0
  const chars = plan.characteristics_count ?? plan.characteristic_count ?? 0
  const docs = plan.documents_count ?? 0

  return (
    <Link
      href={`/plans/${plan.id}/workspace`}
      className="group flex flex-col gap-2 rounded-lg border bg-card p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-sm font-semibold">{plan.plan_number}</span>
        <Badge variant={planStatusVariant[plan.status] || "outline"}>{plan.status}</Badge>
      </div>
      <p className="line-clamp-2 text-sm" title={plan.plan_name}>
        {plan.plan_name}
      </p>
      <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span>{docs} doc{docs === 1 ? "" : "s"}</span>
        <span>·</span>
        <span>{balloons} balloon{balloons === 1 ? "" : "s"}</span>
        <span>·</span>
        <span>{chars} char{chars === 1 ? "" : "s"}</span>
      </div>
    </Link>
  )
}
