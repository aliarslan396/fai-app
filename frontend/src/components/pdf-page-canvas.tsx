"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import api from "@/lib/api"
import { pdfjsLib } from "@/lib/pdf"

interface Props {
  drawingId: number
  pageNumber: number
  scale: number
  onRendered?: (dims: { width: number; height: number }) => void
}

// Cache of loaded PDFs by drawing id, so flipping pages doesn't re-download.
const pdfCache: Map<number, ReturnType<typeof pdfjsLib.getDocument>["promise"]> = new Map()

function loadPdf(drawingId: number) {
  if (!pdfCache.has(drawingId)) {
    const promise = api
      .get(`/drawings/${drawingId}/download`, { responseType: "arraybuffer" })
      .then((res) => pdfjsLib.getDocument({ data: new Uint8Array(res.data) }).promise)
    pdfCache.set(drawingId, promise)
  }
  return pdfCache.get(drawingId)!
}

export function clearPdfCache(drawingId?: number) {
  if (drawingId != null) pdfCache.delete(drawingId)
  else pdfCache.clear()
}

export function PdfPageCanvas({ drawingId, pageNumber, scale, onRendered }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    loadPdf(drawingId)
      .then(async (pdf) => {
        if (cancelled) return
        const page = await pdf.getPage(pageNumber)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        if (!canvas || cancelled) return

        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`

        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        await page.render({ canvasContext: ctx, viewport }).promise
        if (cancelled) return

        setLoading(false)
        onRendered?.({ width: viewport.width, height: viewport.height })
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message || "Failed to render page")
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingId, pageNumber, scale])

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="block bg-white shadow-md" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}
