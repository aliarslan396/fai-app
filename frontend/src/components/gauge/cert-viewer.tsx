"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { fetchGaugeCertBlobUrl } from "@/lib/gauges"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  calibrationId: number | null
  title?: string
}

/**
 * Inline calibration cert viewer. Fetches the PDF as a blob via the
 * authenticated axios client (Sanctum bearer token attached), turns
 * it into a blob: URL, and renders it in an iframe. The URL is
 * revoked when the modal closes to avoid leaking memory.
 */
export function CertViewer({ open, onOpenChange, calibrationId, title }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !calibrationId) return
    let alive = true
    let created: string | null = null

    setLoading(true)
    setError(null)
    setBlobUrl(null)

    fetchGaugeCertBlobUrl(calibrationId)
      .then((url) => {
        if (!alive) {
          URL.revokeObjectURL(url)
          return
        }
        created = url
        setBlobUrl(url)
      })
      .catch(() => alive && setError("Failed to load cert PDF"))
      .finally(() => alive && setLoading(false))

    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [open, calibrationId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title ?? "Calibration Certificate"}</DialogTitle>
        </DialogHeader>
        <div className="relative h-[75vh] w-full">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center text-sm text-destructive">
              {error}
            </div>
          )}
          {!loading && !error && blobUrl && (
            <iframe src={blobUrl} className="h-full w-full rounded-md border" title="Calibration Cert" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
