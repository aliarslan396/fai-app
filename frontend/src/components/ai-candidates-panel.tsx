"use client"

import { useEffect, useState } from "react"
import { Loader2, Sparkles, Check, X, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { EmptyState } from "@/components/empty-state"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

import type { CharType } from "@/components/characteristic-panel"

export interface Candidate {
  source_text: string
  ocr_confidence: number | null
  x_pct: number
  y_pct: number
  bbox: [number, number, number, number]
  char_type: CharType
  nominal: number | null
  upper_tolerance: number | null
  lower_tolerance: number | null
  unit: string | null
  gdt_symbol: string | null
  gdt_datums: string[]
  finish_value: string | null
  finish_unit: string | null
  confidence: number
}

interface Props {
  planId: number
  drawingId: number | null
  pageNumber: number
  onClose: () => void
  onAccepted: () => void
}

function confidenceColor(c: number): "default" | "secondary" | "outline" | "destructive" {
  if (c >= 0.75) return "default"
  if (c >= 0.5) return "secondary"
  return "outline"
}

function confidenceLabel(c: number): string {
  if (c >= 0.75) return "high"
  if (c >= 0.5) return "medium"
  return "low"
}

function formatPreview(c: Candidate): string {
  if (c.char_type === "gdt") {
    const datums = c.gdt_datums?.length ? ` | ${c.gdt_datums.join(" | ")}` : ""
    return `${c.gdt_symbol ?? "?"} ${c.upper_tolerance ?? "?"}${datums}`
  }
  if (c.char_type === "surface_finish") {
    return `${c.finish_value ?? "?"} ${c.finish_unit ?? ""}`.trim()
  }
  if (c.char_type === "note") {
    return c.source_text
  }
  const prefix = c.char_type === "diameter" ? "Ø" : c.char_type === "radius" ? "R" : ""
  const unit = c.unit ?? (c.char_type === "angle" ? "°" : "")
  const upper = c.upper_tolerance ?? 0
  const lower = c.lower_tolerance ?? 0
  const symmetric = Math.abs(upper - lower) < 1e-9
  const tol = symmetric ? `±${upper}` : `+${upper}/-${lower}`
  return `${prefix}${c.nominal ?? "?"} ${tol} ${unit}`.trim()
}

export function AiCandidatesPanel({ planId, drawingId, pageNumber, onClose, onAccepted }: Props) {
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  const runDetection = async () => {
    if (!drawingId) return
    setLoading(true)
    setError(null)
    setCandidates([])
    setSelected(new Set())

    try {
      const { data } = await api.get(
        `/plans/${planId}/drawings/${drawingId}/pages/${pageNumber}/auto-detect`
      )
      const list: Candidate[] = data.candidates ?? []
      setCandidates(list)
      // Auto-select high-confidence ones
      const auto = new Set<number>()
      list.forEach((c, i) => {
        if (c.confidence >= 0.75) auto.add(i)
      })
      setSelected(auto)

      if (list.length === 0) {
        toast.info("AI found no dimension candidates on this page.")
      } else {
        toast.success(`AI suggested ${list.length} candidates`)
      }
    } catch (err) {
      const msg = getErrorMessage(err, "Auto-detect failed")
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // Trigger detection on mount
  useEffect(() => {
    runDetection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, drawingId, pageNumber])

  const toggle = (i: number) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(i)) {
        next.delete(i)
      } else {
        next.add(i)
      }
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === candidates.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(candidates.map((_, i) => i)))
    }
  }

  const acceptSelected = async () => {
    if (!drawingId || selected.size === 0) return
    setAccepting(true)
    try {
      const picked = Array.from(selected).map((i) => candidates[i])
      const { data } = await api.post(`/plans/${planId}/balloons/bulk-accept`, {
        fai_document_id: drawingId,
        page_number: pageNumber,
        candidates: picked,
      })
      toast.success(`${data.count} balloon${data.count !== 1 ? "s" : ""} added`)
      onAccepted()
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to accept"))
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">AI suggestions</span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Local AI (llama3.2) reads OCR text from this page and proposes balloons.
          Tick the ones you want, then click Accept.
        </p>
      </div>

      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 text-xs">
        <button
          type="button"
          onClick={toggleAll}
          disabled={candidates.length === 0 || loading}
          className="font-medium underline-offset-2 hover:underline disabled:opacity-50"
        >
          {selected.size === candidates.length && candidates.length > 0
            ? "Deselect all"
            : "Select all"}
        </button>
        <span className="text-muted-foreground">
          {selected.size} / {candidates.length} selected
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <div>
                <p className="text-sm font-medium">AI scanning page...</p>
                <p className="text-xs text-muted-foreground">
                  Can take 1-3 min on the first page.
                </p>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                <div className="flex-1">
                  <p className="font-medium text-destructive">Detection failed</p>
                  <p className="mt-1 text-xs text-muted-foreground">{error}</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={runDetection}>
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && candidates.length === 0 && (
            <EmptyState
              icon={Sparkles}
              title="No candidates"
              description="AI did not find any dimensional text. Try running OCR first or place balloons manually."
            />
          )}

          {!loading && !error && candidates.length > 0 && (
            <ul className="space-y-2">
              {candidates.map((c, i) => {
                const isSelected = selected.has(i)
                return (
                  <li
                    key={i}
                    className={`rounded-md border p-3 transition-colors ${
                      isSelected ? "border-primary bg-primary/5" : "border-input"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(i)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {c.char_type}
                          </Badge>
                          <Badge variant={confidenceColor(c.confidence)} className="text-[10px]">
                            {confidenceLabel(c.confidence)} · {Math.round(c.confidence * 100)}%
                          </Badge>
                        </div>
                        <div className="mt-1.5 font-mono text-sm">{formatPreview(c)}</div>
                        <div className="mt-1 truncate text-[11px] text-muted-foreground" title={c.source_text}>
                          Source: &ldquo;{c.source_text}&rdquo;
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          Position: {c.x_pct.toFixed(1)}%, {c.y_pct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="border-t bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runDetection}
            disabled={loading || accepting}
            className="flex-1"
          >
            {loading ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-3.5 w-3.5" />
            )}
            Re-run
          </Button>
          <Button
            size="sm"
            onClick={acceptSelected}
            disabled={accepting || selected.size === 0 || loading}
            className="flex-1"
          >
            {accepting ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-2 h-3.5 w-3.5" />
            )}
            Accept ({selected.size})
          </Button>
        </div>
      </div>
    </div>
  )
}
