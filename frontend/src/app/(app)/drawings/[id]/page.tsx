"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, Loader2, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Eye, EyeOff,
} from "lucide-react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/error-state"
import { AuthImage } from "@/components/auth-image"
import { toast } from "sonner"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

async function downloadDrawing(d: { id: number; original_filename: string }) {
  try {
    const res = await api.get(`/drawings/${d.id}/download`, { responseType: "blob" })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement("a")
    a.href = url
    a.download = d.original_filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (err) {
    toast.error(getErrorMessage(err, "Download failed"))
  }
}

interface DrawingPage {
  id: number
  page_number: number
  image_path: string
  thumbnail_path: string
  width: number
  height: number
  ocr_completed_at: string | null
}

interface OcrBlock {
  text: string
  bbox: [number, number, number, number] // x, y, w, h in image-space pixels
  confidence: number
}

interface DrawingDetail {
  id: number
  original_filename: string
  drawing_number: string | null
  revision: string | null
  page_count: number
  ocr_pages_done?: number
  status: string
  processing_error: string | null
  file_size: number
  part: {
    id: number
    part_number: string
    revision: string
    description: string
  } | null
  pages: DrawingPage[]
  uploader: { id: number; name: string; email: string } | null
}

// Zoom multipliers RELATIVE TO fit-to-width baseline (not natural pixel size).
// 1.0 means image fills viewport width.
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6]

export default function DrawingViewerPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [drawing, setDrawing] = useState<DrawingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [imageLoading, setImageLoading] = useState(true)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [showOcr, setShowOcr] = useState(false)
  const [ocrBlocks, setOcrBlocks] = useState<OcrBlock[]>([])
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrPending, setOcrPending] = useState(false)

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {})
    }
  }

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  useEffect(() => {
    if (!viewportRef.current) return
    const el = viewportRef.current
    const observer = new ResizeObserver(() => {
      setViewportWidth(el.clientWidth - 32) // padding allowance
    })
    observer.observe(el)
    setViewportWidth(el.clientWidth - 32)
    return () => observer.disconnect()
  }, [drawing])

  const fetchDrawing = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get(`/drawings/${params.id}`)
      setDrawing(data.drawing)
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load drawing"))
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchDrawing()
  }, [fetchDrawing])

  // Poll silently while OCR is still running so the header banner
  // advances without the user having to reload the page.
  useEffect(() => {
    if (!drawing) return
    if (drawing.ocr_pages_done === undefined || drawing.ocr_pages_done >= drawing.page_count) return
    const t = setInterval(() => {
      api
        .get(`/drawings/${params.id}`)
        .then((res) => setDrawing(res.data.drawing))
        .catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [drawing, params.id])

  useEffect(() => {
    setImageLoading(true)
    setOcrBlocks([])
    setOcrPending(false)
  }, [currentPage])

  useEffect(() => {
    if (!showOcr || !drawing || ocrBlocks.length > 0) return
    setOcrLoading(true)
    api
      .get(`/drawings/${drawing.id}/pages/${currentPage}/ocr`)
      .then((res) => {
        const blocks = res.data?.ocr?.blocks ?? []
        const completed = res.data?.ocr_completed_at
        setOcrBlocks(blocks)
        setOcrPending(!completed && blocks.length === 0)
      })
      .catch(() => { setOcrBlocks([]); setOcrPending(false) })
      .finally(() => setOcrLoading(false))
  }, [showOcr, currentPage, drawing, ocrBlocks.length])

  // Poll OCR while it's still pending for the visible page so Terry
  // doesn't have to toggle the overlay again once Tesseract catches up.
  useEffect(() => {
    if (!showOcr || !ocrPending || !drawing) return
    const t = setInterval(() => {
      api
        .get(`/drawings/${drawing.id}/pages/${currentPage}/ocr`)
        .then((res) => {
          const blocks = res.data?.ocr?.blocks ?? []
          if (res.data?.ocr_completed_at) {
            setOcrBlocks(blocks)
            setOcrPending(false)
          }
        })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [showOcr, ocrPending, currentPage, drawing])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setCurrentPage((p) => Math.max(1, p - 1))
      if (e.key === "ArrowRight" && drawing) {
        setCurrentPage((p) => Math.min(drawing.page_count, p + 1))
      }
      if (e.key === "+" || e.key === "=") changeZoom(1)
      if (e.key === "-") changeZoom(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing])

  const changeZoom = (dir: 1 | -1) => {
    const idx = ZOOM_LEVELS.indexOf(zoom)
    const newIdx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + dir))
    setZoom(ZOOM_LEVELS[newIdx])
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !drawing) {
    return (
      <ErrorState
        title="Failed to load drawing"
        description={error || "Not found"}
        onRetry={fetchDrawing}
      />
    )
  }

  const page = drawing.pages.find((p) => p.page_number === currentPage)

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-4">
      <div className="flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => drawing.part ? router.push(`/parts/${drawing.part.id}`) : router.push("/parts")}
            className="mb-1 -ml-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {drawing.part ? `${drawing.part.part_number} Rev ${drawing.part.revision}` : "Back"}
          </Button>
          <h1 className="truncate text-xl font-semibold tracking-tight" title={drawing.original_filename}>
            {drawing.original_filename}
          </h1>
          <p className="text-sm text-muted-foreground">
            {drawing.page_count} pages
            {drawing.drawing_number && ` · ${drawing.drawing_number}`}
            {drawing.revision && ` Rev ${drawing.revision}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadDrawing(drawing)}>
          <Download className="mr-2 h-4 w-4" />
          Download original
        </Button>
      </div>

      {drawing.ocr_pages_done !== undefined && drawing.ocr_pages_done < drawing.page_count && (
        <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-medium">OCR running</span>
          <span className="text-amber-700">
            {drawing.ocr_pages_done} of {drawing.page_count} pages processed —
            pages without OCR yet will show an amber banner when you toggle the overlay
          </span>
          <div className="ml-auto h-1.5 w-40 overflow-hidden rounded-full bg-amber-200">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${Math.round((drawing.ocr_pages_done / drawing.page_count) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Thumbnails sidebar */}
        {drawing.pages.length > 1 && (
          <Card className="hidden w-32 shrink-0 overflow-y-auto p-2 lg:block">
            <div className="flex flex-col gap-2">
              {drawing.pages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setCurrentPage(p.page_number)}
                  className={`group relative rounded-md border-2 p-1 transition-colors ${
                    p.page_number === currentPage
                      ? "border-primary"
                      : "border-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  <AuthImage
                    src={`/drawings/${drawing.id}/pages/${p.page_number}/thumbnail`}
                    alt={`Page ${p.page_number}`}
                    className="w-full bg-white"
                  />
                  <div className="mt-1 text-center text-xs font-medium">
                    Page {p.page_number}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Main viewer */}
        <Card className="relative flex flex-1 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page <strong>{currentPage}</strong> / {drawing.page_count}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage((p) => Math.min(drawing.page_count, p + 1))}
                disabled={currentPage >= drawing.page_count}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => changeZoom(-1)}
                disabled={zoom === ZOOM_LEVELS[0]}
                title="Zoom out (-)"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="min-w-[3.5rem] text-center text-sm tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => changeZoom(1)}
                disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                title="Zoom in (+)"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant={showOcr ? "default" : "ghost"}
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setShowOcr((v) => !v)}
                title="Toggle OCR overlay"
              >
                {ocrLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : showOcr ? (
                  <EyeOff className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <Eye className="mr-1 h-3.5 w-3.5" />
                )}
                OCR
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setZoom(1)}
                title="Reset to fit width"
              >
                Reset
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleFullscreen}
                title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Image area */}
          <div
            ref={viewportRef}
            className="relative flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900"
          >
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {page && viewportWidth > 0 ? (
              (() => {
                const displayWidth = viewportWidth * zoom
                const aspectRatio = page.height / page.width
                const displayHeight = displayWidth * aspectRatio
                const justifyClass = zoom > 1 ? "justify-start" : "justify-center"
                const scale = displayWidth / page.width
                return (
                  <div className={`flex min-h-full items-start p-4 ${justifyClass}`}>
                    <div
                      className="relative shrink-0"
                      style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
                    >
                      <AuthImage
                        key={page.id}
                        src={`/drawings/${drawing.id}/pages/${currentPage}/image`}
                        alt={`Page ${currentPage}`}
                        className="absolute inset-0 bg-white shadow-md"
                        style={{
                          width: "100%",
                          height: "100%",
                          maxWidth: "none",
                          maxHeight: "none",
                          imageRendering: zoom > 2 ? "pixelated" : "auto",
                        }}
                        onLoad={() => setImageLoading(false)}
                        onError={() => setImageLoading(false)}
                      />
                      {showOcr &&
                        ocrBlocks.map((b, i) => (
                          <div
                            key={i}
                            className="pointer-events-none absolute border border-emerald-500 bg-emerald-500/10"
                            style={{
                              left: `${b.bbox[0] * scale}px`,
                              top: `${b.bbox[1] * scale}px`,
                              width: `${b.bbox[2] * scale}px`,
                              height: `${b.bbox[3] * scale}px`,
                            }}
                            title={`${b.text} (${(b.confidence * 100).toFixed(0)}%)`}
                          />
                        ))}
                      {showOcr && ocrPending && (
                        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
                          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                          OCR still processing this page — auto-refresh every 5s
                        </div>
                      )}
                      {showOcr && !ocrPending && !ocrLoading && ocrBlocks.length === 0 && (
                        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
                          OCR found no text on this page
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()
            ) : !page ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Page not found
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  )
}
