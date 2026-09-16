"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Download,
  Loader2,
  Move,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type CorrectionType = "reposition" | "reject" | "relabel"

interface TopDrawing {
  drawing_id: number
  filename: string | null
  count: number
}

interface Summary {
  window_days: number
  total_corrections: number
  recent_count: number
  by_type: Record<CorrectionType, number>
  top_drawings: TopDrawing[]
}

interface RecentRow {
  id: number
  created_at: string | null
  type: CorrectionType
  plan_id: number
  plan_number: string | null
  drawing_id: number
  drawing_filename: string | null
  page_number: number
  balloon_id: number | null
  original_char_type: string | null
  corrected_char_type: string | null
  original_x_pct: string | null
  original_y_pct: string | null
  corrected_x_pct: string | null
  corrected_y_pct: string | null
  user_name: string | null
}

interface Payload {
  summary: Summary
  recent: RecentRow[]
}

const WINDOW_OPTIONS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
]

const TYPE_META: Record<CorrectionType, { label: string; icon: typeof Move; tone: string }> = {
  reposition: {
    label: "Reposition",
    icon: Move,
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  reject: {
    label: "Reject",
    icon: Trash2,
    tone: "border-rose-200 bg-rose-50 text-rose-700",
  },
  relabel: {
    label: "Relabel",
    icon: Tag,
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  },
}

/**
 * Admin AI feedback dashboard (Sprint 7 · Timothy Aug 26 request).
 *
 * Every user correction to an AI-detected balloon lands here — the
 * shop uses this to (a) spot drawings where the model is weakest and
 * (b) hand the weekly CSV to the prompt-tuning session.
 *
 * Admin-only per doc §7.3; sidebar hides the link from non-admins.
 */
export default function AdminAiFeedbackPage() {
  const { hasRole } = useAuthStore()
  const canView = hasRole("admin")

  const [days, setDays] = useState<number>(30)
  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const load = useCallback(
    async (windowDays: number) => {
      if (!canView) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get<Payload>("/admin/ai-feedback", {
          params: { days: windowDays },
        })
        setPayload(data)
      } catch (err) {
        setError(getErrorMessage(err, "Failed to load AI feedback data"))
      } finally {
        setLoading(false)
      }
    },
    [canView],
  )

  useEffect(() => {
    void load(days)
  }, [days, load])

  async function downloadCsv() {
    setDownloading(true)
    try {
      const response = await api.get("/admin/ai-feedback/export", { responseType: "blob" })
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const stamp = new Date().toISOString().slice(0, 10)
      a.download = `ai-corrections-${stamp}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success("CSV export downloaded")
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to download CSV"))
    } finally {
      setDownloading(false)
    }
  }

  const totalRecent = useMemo(() => {
    if (!payload) return 0
    const { by_type } = payload.summary
    return by_type.reposition + by_type.reject + by_type.relabel
  }, [payload])

  if (!canView) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        AI feedback data is admin-only.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Sparkles className="h-6 w-6 text-violet-600" />
            AI Feedback Loop
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every user correction to an AI-detected balloon is logged here. Use the CSV export
            to feed the weekly prompt-tuning session and lift OCR accuracy over time.
          </p>
        </div>
        <Button onClick={downloadCsv} disabled={downloading || !payload}>
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Window
        </span>
        {WINDOW_OPTIONS.map((opt) => (
          <Button
            key={opt.days}
            variant={days === opt.days ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(opt.days)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error || !payload ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? "Failed to load."}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label="Total corrections"
              value={payload.summary.total_corrections}
              sub="All-time"
              tone="border-slate-200 bg-slate-50 text-slate-900"
            />
            <KpiCard
              label={`Last ${payload.summary.window_days}d`}
              value={payload.summary.recent_count}
              sub={totalRecent > 0 ? "Corrections in window" : "No activity"}
              tone="border-violet-200 bg-violet-50 text-violet-900"
            />
            {(["reposition", "reject", "relabel"] as const).map((t) => {
              const meta = TYPE_META[t]
              const Icon = meta.icon
              return (
                <KpiCard
                  key={t}
                  label={meta.label}
                  value={payload.summary.by_type[t]}
                  sub={`Last ${payload.summary.window_days}d`}
                  tone={meta.tone}
                  icon={<Icon className="h-4 w-4" />}
                />
              )
            })}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-violet-600" />
                Drawings with the most corrections
              </CardTitle>
              <CardDescription>
                Highest-friction drawings in the last {payload.summary.window_days} days. Consider re-training
                the AI or re-scanning these drawings.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {payload.summary.top_drawings.length === 0 ? (
                <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No corrections yet in this window.
                </div>
              ) : (
                <ul className="divide-y">
                  {payload.summary.top_drawings.map((d) => (
                    <li key={d.drawing_id} className="flex items-center justify-between py-2.5">
                      <span className="truncate text-sm font-medium text-slate-800">
                        {d.filename ?? `Drawing #${d.drawing_id}`}
                      </span>
                      <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">
                        {d.count} correction{d.count === 1 ? "" : "s"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent corrections</CardTitle>
              <CardDescription>Last 50 events across all drawings.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {payload.recent.length === 0 ? (
                <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No corrections captured yet. Drag, delete, or relabel an AI-placed balloon
                  in a Plan workspace to seed the log.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Drawing</TableHead>
                        <TableHead>Change</TableHead>
                        <TableHead>User</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payload.recent.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell>
                            <TypePill type={r.type} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {r.plan_number ? (
                              <Link
                                href={`/plans/${r.plan_id}/workspace${r.balloon_id ? `?balloon=${r.balloon_id}` : ""}`}
                                className="text-sm font-medium text-violet-700 hover:underline"
                              >
                                {r.plan_number}
                              </Link>
                            ) : (
                              <span className="text-sm text-muted-foreground">Plan #{r.plan_id}</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-slate-700">
                            {r.drawing_filename ?? `#${r.drawing_id}`}
                            <span className="ml-1 text-xs text-muted-foreground">p.{r.page_number}</span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <ChangeCell row={r} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-slate-700">
                            {r.user_name ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string
  value: number
  sub: string
  tone: string
  icon?: React.ReactNode
}) {
  return (
    <Card className={`border ${tone}`}>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</div>
          {icon}
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums">{value.toLocaleString()}</div>
        <div className="mt-1 text-xs opacity-70">{sub}</div>
      </CardContent>
    </Card>
  )
}

function TypePill({ type }: { type: CorrectionType }) {
  const meta = TYPE_META[type]
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={meta.tone}>
      <Icon className="mr-1 h-3 w-3" />
      {meta.label}
    </Badge>
  )
}

function ChangeCell({ row }: { row: RecentRow }) {
  if (row.type === "reject") {
    return <span className="text-rose-700">Balloon removed</span>
  }
  if (row.type === "relabel") {
    return (
      <span>
        <span className="text-slate-500">{row.original_char_type ?? "—"}</span>
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="font-medium text-slate-900">{row.corrected_char_type ?? "—"}</span>
      </span>
    )
  }
  // reposition
  const orig =
    row.original_x_pct != null && row.original_y_pct != null
      ? `(${Number(row.original_x_pct).toFixed(1)}, ${Number(row.original_y_pct).toFixed(1)})`
      : "—"
  const next =
    row.corrected_x_pct != null && row.corrected_y_pct != null
      ? `(${Number(row.corrected_x_pct).toFixed(1)}, ${Number(row.corrected_y_pct).toFixed(1)})`
      : "—"
  return (
    <span>
      <span className="text-slate-500">{orig}</span>
      <span className="mx-1 text-muted-foreground">→</span>
      <span className="font-medium text-slate-900">{next}</span>
    </span>
  )
}
