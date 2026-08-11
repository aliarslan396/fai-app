"use client"

import { useRef, useState } from "react"
import { Loader2, Upload, Trash2, FileText, Image as ImageIcon, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import { AuthImage } from "@/components/auth-image"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import type { NcrAttachment } from "@/lib/ncrs"

const MAX_COUNT = 10
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED = ".jpg,.jpeg,.png,.pdf"

interface Props {
  ncrId: number
  attachments: NcrAttachment[]
  canEdit: boolean
  isClosed: boolean
  onChange: () => void
}

/**
 * Photo / doc evidence attached to an NCR per doc 3.10.
 * Bounded by MAX_COUNT files per NCR and MAX_BYTES per file. Files
 * become immutable once the NCR closes so the audit trail is fixed.
 */
export function NcrAttachmentsPanel({ ncrId, attachments, canEdit, isClosed, onChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<NcrAttachment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const remainingSlots = MAX_COUNT - attachments.length
  const uploadEnabled = canEdit && !isClosed && remainingSlots > 0

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      if (attachments.length + 1 > MAX_COUNT) {
        toast.error(`Max ${MAX_COUNT} attachments per NCR reached.`)
        break
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: too large (>10 MB)`)
        continue
      }
      const okType =
        /^image\/(jpeg|jpg|png)$/i.test(file.type) || file.type === "application/pdf"
      if (!okType) {
        toast.error(`${file.name}: only JPG, PNG, or PDF allowed`)
        continue
      }

      const formData = new FormData()
      formData.append("file", file)
      setUploading(true)
      try {
        await api.post(`/ncrs/${ncrId}/attachments`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
        toast.success(`${file.name} uploaded`)
      } catch (err) {
        toast.error(getErrorMessage(err, `${file.name} upload failed`))
      } finally {
        setUploading(false)
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
    onChange()
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/ncrs/${ncrId}/attachments/${deleteTarget.id}`)
      toast.success("Attachment removed")
      setDeleteTarget(null)
      onChange()
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete failed"))
    } finally {
      setDeleting(false)
    }
  }

  const openPreview = async (a: NcrAttachment) => {
    setPreviewName(a.original_filename)
    // Fetch via API (Bearer auth) then create blob URL for iframe / img src
    try {
      const res = await api.get(`/ncrs/${ncrId}/attachments/${a.id}`, {
        responseType: "blob",
      })
      const url = URL.createObjectURL(res.data)
      setPreviewUrl(url)
    } catch (err) {
      toast.error(getErrorMessage(err, "Preview failed"))
    }
  }

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPreviewName("")
  }

  const downloadAttachment = async (a: NcrAttachment) => {
    try {
      const res = await api.get(`/ncrs/${ncrId}/attachments/${a.id}`, {
        responseType: "blob",
      })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement("a")
      link.href = url
      link.download = a.original_filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      toast.error(getErrorMessage(err, "Download failed"))
    }
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">
              Attachments ({attachments.length}/{MAX_COUNT})
            </div>
            <div className="text-xs text-muted-foreground">
              JPG, PNG, or PDF up to 10 MB each. Files stay attached even after close-out.
            </div>
          </div>
          {uploadEnabled && (
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
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1 h-3.5 w-3.5" />
                )}
                Upload
              </Button>
            </>
          )}
        </div>

        {attachments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
            <div className="text-sm text-muted-foreground">
              {uploadEnabled
                ? "No attachments yet. Drag files here or click Upload."
                : isClosed
                  ? "No attachments. Cannot add after closure."
                  : "No attachments."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="group relative overflow-hidden rounded-md border bg-card transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => openPreview(a)}
                  className="flex aspect-square w-full items-center justify-center overflow-hidden bg-muted"
                >
                  {a.is_image ? (
                    <AuthImage
                      src={`/ncrs/${a.ncr_id}/attachments/${a.id}`}
                      alt={a.original_filename}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 p-3 text-muted-foreground">
                      <FileText className="h-10 w-10" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">PDF</span>
                    </div>
                  )}
                </button>
                <div className="flex flex-col gap-1 p-2">
                  <div
                    className="line-clamp-1 text-xs font-medium"
                    title={a.original_filename}
                  >
                    {a.original_filename}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{a.human_size}</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => downloadAttachment(a)}
                        className="rounded p-1 hover:bg-muted"
                        title="Download"
                      >
                        <Upload className="h-3 w-3 rotate-180" />
                      </button>
                      {canEdit && !isClosed && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(a)}
                          className="rounded p-1 text-destructive hover:bg-destructive/10"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove attachment?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.original_filename} will be permanently removed from this NCR.
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

      {/* Preview modal — full-size */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={closePreview}
        >
          <div
            className="relative flex max-h-full max-w-5xl flex-col overflow-hidden rounded-lg bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="truncate text-sm font-medium">{previewName}</span>
              <Button variant="ghost" size="icon" onClick={closePreview}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto bg-muted p-2">
              {previewName.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={previewUrl}
                  className="h-[80vh] w-[80vw] max-w-full"
                  title={previewName}
                />
              ) : (
                <img
                  src={previewUrl}
                  alt={previewName}
                  className="max-h-[80vh] max-w-full object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
