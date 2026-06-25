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
  is_reference?: boolean
  confidence: number
}

interface Stats {
  total_ocr_blocks: number
  merged_blocks: number
  dimension_like: number
  auto_accepted: number
  needs_review: number
}

interface Props {
  planId: number
  drawingId: number | null
  pageNumber: number
  onClose: () => void
  onAccepted: () => void
}

function confidenceColor(c: number): "default" | "secondary" | "outline" | "destructive" {
  if (c >= 0.85) return "default"
  if (c >= 0.7) return "secondary"
  return "outline"
}

function formatPreview(c: Candidate): string {
  if (c.char_type === "gdt") {
    const datums = c.gdt_datums?.length ? ` | ${c.gdt_datums.join(" | ")}` : ""
    return `${c.gdt_symbol ?? "?"} ${c.upper_tolerance ?? "?"}${datums}`
  }
  if (c.char_type === "surface_finish") {
    return `${c.finish_value ?? "?"} ${c.finish_unit ?? ""}`.trim()
  }
  const prefix = c.char_type === "diameter" ? "Ø" : c.char_type === "radius" ? "R" : ""
  const unit = c.unit ?? (c.char_type === "angle" ? "°" : "")
  const upper = c.upper_tolerance ?? 0
  const lower = c.lower_tolerance ?? 0
  const symmetric = Math.abs(upper - lower) < 1e-9
  const tol = c.is_reference
    ? "(ref)"
    : symmetric
      ? `±${upper}`
      : `+${upper}/-${lower}`
  return `${prefix}${c.nominal ?? "?"} ${tol} ${unit}`.trim()
}

export function AiCandidatesPanel({ planId, drawingId, pageNumber, onClose, onAccepted }: Props) {
  const [loading, setLoading] = useState(false)
  const [autoList, setAutoList] = useState<Candidate[]>([])
  const [reviewList, setReviewList] = useState<Candidate[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  // Selection sets: indices into respective lists
  const [autoSelected, setAutoSelected] = useState<Set<number>>(new Set())
  const [reviewSelected, setReviewSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  const runDetection = async () => {
    if (!drawingId) return
    setLoading(true)
    setError(null)
    setAutoList([])
    setReviewList([])
    setStats(null)
    setAutoSelected(new Set())
    setReviewSelected(new Set())

    try {
      const { data } = await api.get(
        `/plans/${planId}/drawings/${drawingId}/pages/${pageNumber}/auto-detect`
      )
      const auto: Candidate[] = data.auto_accept ?? []
      const review: Candidate[] = data.review ?? []
      setAutoList(auto)
      setReviewList(review)
      setStats(data.stats ?? null)
      // Pre-tick everything in auto-accept
      setAutoSelected(new Set(auto.map((_, i) => i)))

      const total = auto.length + review.length
      if (total === 0) {
        toast.info("AI found no dimension candidates on this page.")
      } else {
        toast.success(`AI found ${auto.length} high-confidence + ${review.length} for review`)
      }
    } catch (err) {
      const msg = getErrorMessage(err, "Auto-detect failed")
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runDetection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, drawingId, pageNumber])

  const toggle = (set: Set<number>, setSet: (s: Set<number>) => void, i: number) => {
    const next = new Set(set)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSet(next)
  }

  const totalSelected = autoSelected.size + reviewSelected.size

  const acceptSelected = async () => {
    if (!drawingId || totalSelected === 0) return
    setAccepting(true)
    try {
      const picked = [
        ...Array.from(autoSelected).map((i) => autoList[i]),
        ...Array.from(reviewSelected).map((i) => reviewList[i]),
      ]
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
          Local AI reads OCR text from this page and proposes balloons.
          High-confidence ones are pre-ticked.
        </p>
        {stats && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {stats.total_ocr_blocks} OCR blocks → {stats.merged_blocks} merged →{" "}
            {stats.dimension_like} dim-like → {stats.auto_accepted} auto + {stats.needs_review} review
          </p>
        )}
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

          {!loading && !error && autoList.length === 0 && reviewList.length === 0 && (
            <EmptyState
              icon={Sparkles}
              title="No candidates"
              description="AI did not find any dimensional text. Try a different page or place balloons manually."
            />
          )}

          {!loading && !error && autoList.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="default" className="text-[10px]">
                  Auto-accepted ({autoList.length})
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  High confidence ≥ 85%
                </span>
              </div>
              <ul className="space-y-2">
                {autoList.map((c, i) => (
                  <CandidateCard
                    key={`auto-${i}`}
                    candidate={c}
                    selected={autoSelected.has(i)}
                    onToggle={() => toggle(autoSelected, setAutoSelected, i)}
                  />
                ))}
              </ul>
            </div>
          )}

          {!loading && !error && reviewList.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  Needs review ({reviewList.length})
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  Confidence 50-85%
                </span>
              </div>
              <ul className="space-y-2">
                {reviewList.map((c, i) => (
                  <CandidateCard
                    key={`review-${i}`}
                    candidate={c}
                    selected={reviewSelected.has(i)}
                    onToggle={() => toggle(reviewSelected, setReviewSelected, i)}
                  />
                ))}
              </ul>
            </div>
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
            disabled={accepting || totalSelected === 0 || loading}
            className="flex-1"
          >
            {accepting ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-2 h-3.5 w-3.5" />
            )}
            Accept ({totalSelected})
          </Button>
        </div>
      </div>
    </div>
  )
}

interface CardProps {
  candidate: Candidate
  selected: boolean
  onToggle: () => void
}

function CandidateCard({ candidate: c, selected, onToggle }: CardProps) {
  return (
    <li
      className={`rounded-md border p-3 transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-input"
      }`}
    >
      <div className="flex items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase">
              {c.char_type}
            </Badge>
            {c.is_reference && (
              <Badge variant="outline" className="text-[10px]">
                ref
              </Badge>
            )}
            <Badge variant={confidenceColor(c.confidence)} className="text-[10px]">
              {Math.round(c.confidence * 100)}%
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
}
