"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import api from "@/lib/api"
import { getApiBaseUrl } from "@/lib/tenant"
import { useAuthStore } from "@/lib/auth-store"
import { getErrorMessage } from "@/lib/errors"

/**
 * Two-phase upload → preview → commit dialog.
 * Reusable across Parts and Plans. Backend endpoints match the
 * kind prop ({kind}/import/preview + /commit + /template).
 */
export type CsvImportKind = "parts" | "plans"

interface PreviewResponse {
  total_rows: number
  new_count: number
  skipped_count: number
  error_count: number
  sample_new: Array<Record<string, unknown>>
  skipped: Array<{ line: number; part?: string }>
  errors: Array<{ line: number; part?: string; plan?: string; errors: string[] }>
}

interface CommitResponse {
  committed: number
  skipped_duplicates?: number
  error_count?: number
  total_rows?: number
  errors?: Array<{ line: number; errors: string[] }>
  message?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: CsvImportKind
  onDone?: () => void
}

const HEADING: Record<CsvImportKind, { title: string; entity: string; sampleFields: string[] }> = {
  parts: {
    title: "Import Parts from CSV",
    entity: "part",
    sampleFields: ["line", "part_number", "revision", "description", "customer", "status"],
  },
  plans: {
    title: "Import Inspection Plans from CSV",
    entity: "plan",
    sampleFields: ["line", "part_number", "revision", "plan_name", "status"],
  },
}

export function CsvImportDialog({ open, onOpenChange, kind, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [committed, setCommitted] = useState<CommitResponse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const meta = HEADING[kind]
  const canCommit = preview && preview.new_count > 0 && preview.error_count === 0

  const reset = () => {
    setFile(null)
    setPreview(null)
    setCommitted(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  async function loadPreview(f: File) {
    setBusy(true)
    setPreview(null)
    setCommitted(null)
    try {
      const form = new FormData()
      form.append("file", f)
      const { data } = await api.post<PreviewResponse>(`/${kind}/import/preview`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      setPreview(data)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to read CSV"))
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    if (!file) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const { data } = await api.post<CommitResponse>(`/${kind}/import/commit`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      setCommitted(data)
      if (data.committed > 0) {
        toast.success(`Imported ${data.committed} ${meta.entity}${data.committed !== 1 ? "s" : ""}`)
        onDone?.()
      } else {
        toast.error(data.message ?? "Nothing was imported")
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Import failed"))
    } finally {
      setBusy(false)
    }
  }

  async function downloadTemplate() {
    try {
      const res = await api.get(`/${kind}/import/template`, { responseType: "blob" })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement("a")
      a.href = url
      a.download = `${kind}_import_template.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to download template"))
    }
  }

  const sampleCols = preview?.sample_new?.[0] ? Object.keys(preview.sample_new[0]).filter((k) => meta.sampleFields.includes(k)) : []

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            {meta.title}
          </DialogTitle>
          <DialogDescription>
            Upload a CSV. Preview shows what will happen. Nothing writes until you click Confirm Import.
          </DialogDescription>
        </DialogHeader>

        {/* Committed success state */}
        {committed && committed.committed > 0 ? (
          <div className="space-y-3">
            <Card className="border-emerald-200 bg-emerald-50/60">
              <CardContent className="flex items-start gap-3 py-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
                <div className="text-sm">
                  <div className="font-semibold text-emerald-900">
                    {committed.committed} {meta.entity}{committed.committed !== 1 ? "s" : ""} imported
                  </div>
                  {committed.skipped_duplicates ? (
                    <div className="text-emerald-800">
                      {committed.skipped_duplicates} duplicate{committed.skipped_duplicates !== 1 ? "s were" : " was"} skipped.
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Import another file
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Upload */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium" htmlFor="csv-file">CSV File</label>
                <input
                  ref={inputRef}
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    setFile(f)
                    if (f) void loadPreview(f)
                  }}
                  className="block w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm hover:file:bg-muted/80"
                />
              </div>
              <Button variant="outline" onClick={downloadTemplate} disabled={busy}>
                <Download className="mr-1 h-4 w-4" />
                Template
              </Button>
            </div>

            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Parsing…
              </div>
            )}

            {/* Preview */}
            {preview && !busy && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <StatTile label="Will create" value={preview.new_count} color="emerald" />
                  <StatTile label="Duplicates skipped" value={preview.skipped_count} color="amber" />
                  <StatTile label="Errors" value={preview.error_count} color="red" />
                </div>

                {preview.error_count > 0 && (
                  <Card className="border-red-200 bg-red-50/60">
                    <CardContent className="space-y-2 py-3 text-sm">
                      <div className="flex items-center gap-2 font-semibold text-red-900">
                        <AlertTriangle className="h-4 w-4" />
                        {preview.error_count} row{preview.error_count !== 1 ? "s have" : " has"} errors — fix and re-upload
                      </div>
                      <ul className="ml-6 list-disc space-y-1 text-red-800">
                        {preview.errors.slice(0, 8).map((e, i) => (
                          <li key={i}>
                            <span className="font-mono text-xs">line {e.line}</span>: {e.errors.join(", ")}
                          </li>
                        ))}
                        {preview.errors.length > 8 && (
                          <li className="text-xs italic">…and {preview.errors.length - 8} more</li>
                        )}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {preview.new_count > 0 && (
                  <div className="rounded-md border">
                    <div className="border-b bg-muted/30 px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Sample of new rows ({Math.min(preview.sample_new.length, preview.new_count)} of {preview.new_count})
                    </div>
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/20">
                          <tr>
                            {sampleCols.map((c) => (
                              <th key={c} className="px-2 py-1 text-left font-medium">
                                {c.replace(/_/g, " ")}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.sample_new.map((r, i) => (
                            <tr key={i} className="border-t">
                              {sampleCols.map((c) => (
                                <td key={c} className="px-2 py-1 font-mono">
                                  {String(r[c] ?? "")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={commit} disabled={busy || !canCommit}>
                {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                <Upload className="mr-1 h-4 w-4" />
                Confirm Import{preview ? ` (${preview.new_count})` : ""}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatTile({ label, value, color }: { label: string; value: number; color: "emerald" | "amber" | "red" }) {
  const colors = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
  }[color]
  return (
    <div className={`rounded-md border p-2 text-center ${colors}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wider">{label}</div>
    </div>
  )
}
