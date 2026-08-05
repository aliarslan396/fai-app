"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft, MousePointer, Crosshair, ListOrdered, Upload, Loader2, X, FileText,
  ZoomIn, ZoomOut, Maximize2, Sparkles, CheckCircle2, Archive,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { ErrorState } from "@/components/error-state"
import { PdfPageCanvas } from "@/components/pdf-page-canvas"
import { AuthImage } from "@/components/auth-image"
import {
  CharacteristicPanel,
  type Characteristic,
  type CharType,
} from "@/components/characteristic-panel"
import { AiCandidatesPanel } from "@/components/ai-candidates-panel"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"

interface PlanDocument {
  id: number
  original_filename: string
  document_label: string | null
  page_count: number
  status: string
  sort_order: number
  pages: { id: number; page_number: number; width: number; height: number; thumbnail_path: string | null; ocr_completed_at: string | null }[]
}

interface Plan {
  id: number
  plan_number: string
  plan_name: string
  status: string
  balloon_count: number
  characteristic_count: number
  part: { id: number; part_number: string; revision: string; description: string } | null
  documents: PlanDocument[]
  tol_1dp?: number | string | null
  tol_2dp?: number | string | null
  tol_3dp?: number | string | null
  tol_angular?: number | string | null
}

interface Balloon {
  id: number
  fai_document_id: number
  balloon_number: number
  page_number: number
  x_pct: number | string
  y_pct: number | string
  char_type: CharType
  source: "manual" | "ocr"
  characteristic_id: number | null
  characteristic?: Characteristic | null
}

type Mode = "view" | "place"

export default function PlanWorkspacePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { hasPermission } = useAuthStore()
  const canEdit = hasPermission("plans.edit")

  const [plan, setPlan] = useState<Plan | null>(null)
  const [balloons, setBalloons] = useState<Balloon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeDocId, setActiveDocId] = useState<number | null>(null)
  const [activePage, setActivePage] = useState(1)
  const [pageDims, setPageDims] = useState({ width: 0, height: 0 })
  const [scale, setScale] = useState(0.5)
  const [mode, setMode] = useState<Mode>("view")
  const [selectedBalloon, setSelectedBalloon] = useState<Balloon | null>(null)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [renumbering, setRenumbering] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
  const [renumberConfirmOpen, setRenumberConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  // Fit current rendered page to viewport width.
  const fitToWidth = useCallback(() => {
    if (!viewportRef.current || pageDims.width === 0) return
    const viewportW = viewportRef.current.clientWidth - 32
    if (viewportW <= 0) return
    // currentScale * (natural at scale=1) = pageDims.width
    // newScale = currentScale * viewportW / pageDims.width
    setScale((s) => s * (viewportW / pageDims.width))
  }, [pageDims])

  const fetchPlan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [planRes, balloonRes] = await Promise.all([
        api.get(`/plans/${params.id}`),
        api.get(`/plans/${params.id}/balloons`),
      ])
      const p: Plan = planRes.data.plan
      setPlan(p)
      setBalloons(balloonRes.data.balloons || [])
      if (!activeDocId && p.documents?.length) {
        setActiveDocId(p.documents[0].id)
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load plan"))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  useEffect(() => {
    fetchPlan()
  }, [fetchPlan])

  const activeDoc = plan?.documents.find((d) => d.id === activeDocId) ?? null
  const activePageOcrDone = !!activeDoc?.pages.find((p) => p.page_number === activePage)?.ocr_completed_at

  // Silent poll: refresh only the plan payload (which brings updated
  // per-page ocr_completed_at) whenever the active page hasn't been
  // OCR'd yet. Auto-detect button flips from "waiting" to enabled
  // without the user having to reload.
  useEffect(() => {
    if (!plan || !activeDoc) return
    if (activePageOcrDone) return
    const t = setInterval(() => {
      api
        .get(`/plans/${params.id}`)
        .then((res) => setPlan(res.data.plan))
        .catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [plan, activeDoc, activePageOcrDone, params.id])
  const pageBalloons = balloons.filter(
    (b) => b.fai_document_id === activeDocId && b.page_number === activePage
  )

  const switchDoc = (docId: number) => {
    setActiveDocId(docId)
    setActivePage(1)
    setSelectedBalloon(null)
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !plan) return
    const part = plan.part
    if (!part) {
      toast.error("Plan has no part attached")
      return
    }
    setUploading(true)
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append("part_id", String(part.id))
      fd.append("plan_id", String(plan.id))
      fd.append("file", file)
      try {
        await api.post("/drawings", fd, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 180_000,
        })
        toast.success(`${file.name} uploaded`)
      } catch (err) {
        toast.error(getErrorMessage(err, `${file.name} failed`))
      }
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
    fetchPlan()
  }

  const handleCanvasClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== "place" || !plan || !activeDoc || !pageDims.width) return

    const rect = e.currentTarget.getBoundingClientRect()
    const xPx = e.clientX - rect.left
    const yPx = e.clientY - rect.top
    const x_pct = (xPx / pageDims.width) * 100
    const y_pct = (yPx / pageDims.height) * 100

    try {
      const { data } = await api.post(`/plans/${plan.id}/balloons`, {
        fai_document_id: activeDoc.id,
        page_number: activePage,
        x_pct: Math.max(0, Math.min(100, x_pct)),
        y_pct: Math.max(0, Math.min(100, y_pct)),
        char_type: "linear",
        source: "manual",
      })
      const newBalloon: Balloon = data.balloon
      setBalloons((prev) => [...prev, newBalloon])
      setMode("view")
      setSelectedBalloon(newBalloon)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to place balloon"))
    }
  }

  const handleBalloonClick = (b: Balloon) => {
    if (mode !== "view") return
    setSelectedBalloon(b)
  }

  const handleCharacteristicSaved = (char: Characteristic) => {
    if (!selectedBalloon) return
    setBalloons((prev) =>
      prev.map((b) =>
        b.id === selectedBalloon.id
          ? {
              ...b,
              char_type: char.char_type,
              characteristic_id: char.id ?? b.characteristic_id,
              characteristic: char,
            }
          : b
      )
    )
    if (plan) {
      setPlan({
        ...plan,
        characteristic_count: char.id ? Math.max(plan.characteristic_count, 1) : plan.characteristic_count,
      })
    }
  }

  const handleDeleteBalloon = (balloonId: number) => {
    setDeleteTargetId(balloonId)
  }

  const confirmDeleteBalloon = async () => {
    if (!plan || deleteTargetId == null) return
    setDeleting(true)
    try {
      await api.delete(`/plans/${plan.id}/balloons/${deleteTargetId}`)
      toast.success("Balloon deleted")
      setSelectedBalloon(null)
      setDeleteTargetId(null)
      fetchPlan()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete"))
    } finally {
      setDeleting(false)
    }
  }

  const handleRenumber = () => {
    if (!plan) return
    setRenumberConfirmOpen(true)
  }

  const confirmRenumber = async () => {
    if (!plan) return
    setRenumbering(true)
    setRenumberConfirmOpen(false)
    try {
      await api.post(`/plans/${plan.id}/renumber`)
      toast.success("Renumbered")
      fetchPlan()
    } catch (err) {
      toast.error(getErrorMessage(err, "Renumber failed"))
    } finally {
      setRenumbering(false)
    }
  }

  const [publishing, setPublishing] = useState(false)
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)
  const [retireConfirmOpen, setRetireConfirmOpen] = useState(false)

  const handlePublish = async () => {
    if (!plan) return
    setPublishing(true)
    setPublishConfirmOpen(false)
    try {
      await api.post(`/plans/${plan.id}/publish`)
      toast.success(`${plan.plan_number} published — inspectors can now use it`)
      fetchPlan()
    } catch (err) {
      toast.error(getErrorMessage(err, "Publish failed"))
    } finally {
      setPublishing(false)
    }
  }

  const handleRetire = async () => {
    if (!plan) return
    setPublishing(true)
    setRetireConfirmOpen(false)
    try {
      await api.post(`/plans/${plan.id}/retire`)
      toast.success(`${plan.plan_number} retired — hidden from new inspections`)
      fetchPlan()
    } catch (err) {
      toast.error(getErrorMessage(err, "Retire failed"))
    } finally {
      setPublishing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !plan) {
    return (
      <ErrorState
        title="Failed to load plan"
        description={error || "Not found"}
        onRetry={fetchPlan}
      />
    )
  }

  return (
    <div className="-mx-4 -mb-4 -mt-2 flex h-[calc(100vh-3.5rem)] flex-col lg:-mx-6">
      {/* Top toolbar */}
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => plan.part && router.push(`/parts/${plan.part.id}`)}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono font-semibold">{plan.plan_number}</span>
              <Badge variant={plan.status === "active" ? "default" : "outline"}>{plan.status}</Badge>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {plan.plan_name}
              {plan.part && (
                <>
                  {" · "}
                  <span className="font-mono">{plan.part.part_number} Rev {plan.part.revision}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <Button
              size="sm"
              variant={mode === "view" ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setMode("view")}
            >
              <MousePointer className="mr-1 h-3.5 w-3.5" />
              VIEW
            </Button>
            <Button
              size="sm"
              variant={mode === "place" ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setMode("place")}
              disabled={!canEdit || !activeDoc}
            >
              <Crosshair className="mr-1 h-3.5 w-3.5" />
              PLACE
            </Button>
          </div>
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setScale((s) => Math.max(0.1, s / 1.2))}
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[3rem] text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setScale((s) => Math.min(6, s * 1.2))}
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={fitToWidth}
              title="Fit to width"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedBalloon(null)
              setAiPanelOpen(true)
            }}
            disabled={!canEdit || !activeDoc || !activePageOcrDone}
            title={
              !activeDoc
                ? "Select a document first"
                : !activePageOcrDone
                  ? "OCR still processing this page — Auto-detect needs OCR text to work. Wait for the amber banner to disappear."
                  : "AI scans this page for dimensional callouts and proposes balloons"
            }
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {activeDoc && !activePageOcrDone ? "Auto-detect (waiting OCR)" : "Auto-detect"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRenumber} disabled={!canEdit || renumbering || balloons.length === 0}>
            {renumbering ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ListOrdered className="mr-1 h-3.5 w-3.5" />}
            Renumber
          </Button>

          {canEdit && plan.status === "draft" && (
            <Button
              size="sm"
              onClick={() => setPublishConfirmOpen(true)}
              disabled={publishing || balloons.length === 0}
              title={balloons.length === 0 ? "Place at least one balloon before publishing" : ""}
            >
              {publishing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
              Publish
            </Button>
          )}
          {canEdit && plan.status === "active" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRetireConfirmOpen(true)}
              disabled={publishing}
            >
              {publishing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Archive className="mr-1 h-3.5 w-3.5" />}
              Retire
            </Button>
          )}

          <span className="text-xs text-muted-foreground">
            {balloons.length} balloon{balloons.length !== 1 ? "s" : ""} · {plan.characteristic_count} char{plan.characteristic_count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Documents + Pages */}
        <aside className="hidden w-[280px] shrink-0 flex-col overflow-y-auto border-r bg-card/30 md:flex">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Documents</span>
            {canEdit && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
                  multiple
                  hidden
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                </Button>
              </>
            )}
          </div>

          {plan.documents.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No documents.
              {canEdit && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  Upload PDF
                </Button>
              )}
            </div>
          ) : (
            <div className="p-2 space-y-3">
              {plan.documents.map((doc) => (
                <div key={doc.id}>
                  <button
                    onClick={() => switchDoc(doc.id)}
                    className={`w-full rounded px-2 py-1.5 text-left text-xs ${
                      activeDocId === doc.id ? "bg-muted font-semibold" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="truncate" title={doc.original_filename}>
                      {doc.document_label || doc.original_filename}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {doc.page_count} {doc.page_count === 1 ? "page" : "pages"} · {doc.status}
                    </div>
                  </button>
                  {activeDocId === doc.id && (
                    <div className="ml-2 mt-1 flex flex-col gap-1">
                      {doc.pages.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setActivePage(p.page_number)}
                          className={`flex items-center gap-2 rounded border-2 p-1 text-[10px] transition-colors ${
                            activePage === p.page_number
                              ? "border-primary"
                              : "border-transparent hover:border-muted-foreground/30"
                          }`}
                        >
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-white">
                            <AuthImage
                              src={`/drawings/${doc.id}/pages/${p.page_number}/thumbnail`}
                              alt={`Page ${p.page_number}`}
                              className="h-full w-full object-contain"
                            />
                          </div>
                          <span>Page {p.page_number}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Center: PDF page + balloon overlay */}
        <main
          ref={viewportRef}
          className={`relative flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900 ${
            mode === "place" ? "cursor-crosshair" : ""
          }`}
        >
          {activeDoc ? (
            <div className="inline-block min-w-full p-4" onClick={handleCanvasClick}>
              <div className="relative inline-block">
              <PdfPageCanvas
                drawingId={activeDoc.id}
                pageNumber={activePage}
                scale={scale}
                onRendered={setPageDims}
              />
              {pageDims.width > 0 &&
                pageBalloons.map((b) => {
                  const xPx = (Number(b.x_pct) / 100) * pageDims.width
                  const yPx = (Number(b.y_pct) / 100) * pageDims.height
                  const isSelected = selectedBalloon?.id === b.id
                  const isOcr = b.source === "ocr"
                  return (
                    <div
                      key={b.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleBalloonClick(b)
                      }}
                      className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-2 text-xs font-bold text-white ${
                        isSelected
                          ? "animate-pulse border-[3px] border-blue-500 ring-2 ring-blue-300"
                          : ""
                      } ${
                        isOcr
                          ? "border-orange-600 bg-orange-500"
                          : "border-red-700 bg-red-600"
                      }`}
                      style={{ left: `${xPx}px`, top: `${yPx}px` }}
                      title={`Bubble #${b.balloon_number}${b.characteristic?.requirement_string ? ` — ${b.characteristic.requirement_string}` : ""}`}
                    >
                      {b.balloon_number}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="my-auto text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-12 w-12 opacity-30" />
              Upload a PDF to start placing balloons.
            </div>
          )}
        </main>

        {/* Right panel: AI candidates OR characteristic */}
        <aside className="hidden w-[340px] shrink-0 flex-col border-l bg-card/30 lg:flex">
          {aiPanelOpen ? (
            <AiCandidatesPanel
              planId={plan.id}
              drawingId={activeDocId}
              pageNumber={activePage}
              onClose={() => setAiPanelOpen(false)}
              onAccepted={fetchPlan}
            />
          ) : selectedBalloon ? (
            <>
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  Characteristic
                </span>
                <div className="flex gap-1">
                  {canEdit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleDeleteBalloon(selectedBalloon.id)}
                      title="Delete balloon"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <CharacteristicPanel
                key={selectedBalloon.id}
                planId={plan.id}
                balloonId={selectedBalloon.id}
                balloonNumber={selectedBalloon.balloon_number}
                initialCharType={selectedBalloon.char_type}
                initialCharacteristic={selectedBalloon.characteristic}
                planTolerances={{
                  tol_1dp: Number(plan.tol_1dp ?? 0.03),
                  tol_2dp: Number(plan.tol_2dp ?? 0.01),
                  tol_3dp: Number(plan.tol_3dp ?? 0.005),
                  tol_angular: Number(plan.tol_angular ?? 0.5),
                }}
                onSaved={handleCharacteristicSaved}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              <div>
                <Crosshair className="mx-auto mb-3 h-10 w-10 opacity-30" />
                {mode === "place"
                  ? "Click on the drawing to place a balloon."
                  : "Select a balloon to enter characteristic data."}
              </div>
            </div>
          )}
        </aside>
      </div>

      <AlertDialog open={deleteTargetId != null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this balloon?</AlertDialogTitle>
            <AlertDialogDescription>
              Remaining balloons will renumber automatically.
              {(() => {
                const target = balloons.find((b) => b.id === deleteTargetId)
                return target ? ` Bubble #${target.balloon_number} will be removed.` : ""
              })()}
              {" "}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteBalloon}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={renumberConfirmOpen} onOpenChange={setRenumberConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renumber all balloons?</AlertDialogTitle>
            <AlertDialogDescription>
              Reorders by document → page → top-to-bottom position. Existing
              characteristic data stays attached but balloon numbers will
              change. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={renumbering}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRenumber} disabled={renumbering}>
              {renumbering ? "Renumbering..." : "Renumber"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Publishing flips this plan from <strong>draft</strong> to <strong>active</strong>. Inspectors
              will be able to pick it when creating new inspections. Existing balloons + tolerances
              become the official spec — review carefully before publishing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublish} disabled={publishing}>
              {publishing ? "Publishing..." : "Publish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={retireConfirmOpen} onOpenChange={setRetireConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Retiring flips this plan from <strong>active</strong> to <strong>superseded</strong>.
              Historical inspections against this plan stay intact for the audit trail, but the
              plan disappears from the new-inspection picker. Usually done when a new part
              revision replaces this one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRetire} disabled={publishing}>
              {publishing ? "Retiring..." : "Retire"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
