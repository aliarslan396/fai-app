"use client"

import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, GitBranch, Loader2, Info } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CAPA_STATUS_COLOR, CAPA_STATUS_LABEL, useCapa } from "@/lib/capas"

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    const hh = String(d.getHours()).padStart(2, "0")
    const mi = String(d.getMinutes()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
  } catch {
    return iso
  }
}

/**
 * CAPA detail page — STUB scope. Displays the pre-populated CAPA
 * record + link back to the source NCR. Full 5-tab workflow
 * (Problem / 5-Why / Action Plan / Approval / Effectiveness) ships
 * in Sprint 2 alongside the disposition + effectiveness endpoints.
 */
export default function CapaDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const id = Number(params.id)
  const { capa, loading, error } = useCapa(Number.isFinite(id) ? id : null)

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !capa) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/ncr")} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> NCRs
        </Button>
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? "CAPA not found."}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/ncr")} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to NCRs
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <GitBranch className="h-6 w-6 text-purple-600" />
            <span className="font-mono">{capa.capa_number}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className={CAPA_STATUS_COLOR[capa.status]}>
              {CAPA_STATUS_LABEL[capa.status]}
            </Badge>
            {capa.source_ncr && (
              <Link
                href={`/ncr/${capa.source_ncr.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                Source: {capa.source_ncr.ncr_number}
              </Link>
            )}
            <span>· created {fmtDateTime(capa.created_at)}</span>
            {capa.creator && <span>by {capa.creator.name}</span>}
          </div>
        </div>
      </div>

      <Card className="border-purple-200 bg-purple-50/40">
        <CardContent className="flex items-start gap-3 py-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-purple-700" />
          <div>
            <div className="font-medium text-purple-900">Stub view</div>
            <div className="text-purple-800">
              This is the pre-populated CAPA record. The full workflow — 5-Why analysis,
              action plan, approval, and effectiveness review — ships in the next sprint.
              For now, the CAPA is linked to the source NCR and captured for audit trail.
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Problem</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FieldRow label="Statement">
              <span className="whitespace-pre-wrap text-sm">
                {capa.problem_statement ?? "—"}
              </span>
            </FieldRow>
            <FieldRow label="Defect Code">
              <span className="font-mono text-sm">{capa.defect_code ?? "—"}</span>
            </FieldRow>
            <FieldRow label="Part">
              {capa.part ? (
                <span>
                  <span className="font-medium">{capa.part.part_number}</span>
                  {capa.part.description && (
                    <span className="ml-2 text-muted-foreground">{capa.part.description}</span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </FieldRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Origin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FieldRow label="Source">
              {capa.source_ncr ? (
                <Link
                  href={`/ncr/${capa.source_ncr.id}`}
                  className="font-mono text-sm text-primary hover:underline"
                >
                  {capa.source_ncr.ncr_number}
                </Link>
              ) : (
                <span className="text-muted-foreground">Manual entry</span>
              )}
            </FieldRow>
            <FieldRow label="Created">
              <span className="text-sm">{fmtDateTime(capa.created_at)}</span>
            </FieldRow>
            <FieldRow label="Created By">
              <span className="text-sm">{capa.creator?.name ?? "—"}</span>
            </FieldRow>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-3">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div>{children}</div>
    </div>
  )
}
