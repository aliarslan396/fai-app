"use client"

import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  CalendarCheck,
  CheckSquare,
  FileText,
  GitBranch,
  Loader2,
  Lock,
  ShieldCheck,
  Target,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CAPA_STATUS_COLOR,
  CAPA_STATUS_LABEL,
  tabUnlocked,
  useCapa,
} from "@/lib/capas"
import { ProblemTab } from "@/components/capa/problem-tab"
import { FiveWhyTab } from "@/components/capa/five-why-tab"
import { ActionPlanTab } from "@/components/capa/action-plan-tab"
import { ApprovalTab } from "@/components/capa/approval-tab"
import { EffectivenessTab } from "@/components/capa/effectiveness-tab"

function fmt(iso: string | null | undefined) {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
  } catch {
    return iso
  }
}

/**
 * CAPA detail page — full 5-tab workflow (Sprint 2, doc 3.10).
 * Tabs unlock progressively as prior tabs are completed:
 *   1 Problem            (always)
 *   2 Root Cause 5-Why   (after Tab 1 saved → root_cause_pending)
 *   3 Action Plan        (after all 5 whys + root cause summary → action_plan_pending)
 *   4 Approval           (same time as Tab 3)
 *   5 Effectiveness      (after full approval → approved)
 */
export default function CapaDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const id = Number(params.id)
  const { capa, meta, loading, error, refetch } = useCapa(Number.isFinite(id) ? id : null)

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

  const tabs = [
    { value: "problem", label: "Problem", icon: FileText, unlocked: tabUnlocked(capa.status, 1) },
    { value: "5why", label: "5-Why", icon: Target, unlocked: tabUnlocked(capa.status, 2) },
    { value: "actions", label: "Action Plan", icon: CheckSquare, unlocked: tabUnlocked(capa.status, 3) },
    { value: "approval", label: "Approval", icon: ShieldCheck, unlocked: tabUnlocked(capa.status, 4) },
    { value: "effectiveness", label: "Effectiveness", icon: CalendarCheck, unlocked: tabUnlocked(capa.status, 5) },
  ] as const

  const initialTab = tabs.find((t) => t.unlocked && t.value === activeTabForStatus(capa.status))?.value ?? "problem"

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/ncr")} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to NCRs
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
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
            <span>· created {fmt(capa.created_at)}</span>
            {capa.creator && <span>by {capa.creator.name}</span>}
          </div>
        </div>
      </div>

      {/* Context strip: part, defect */}
      <Card>
        <CardContent className="grid gap-3 py-4 sm:grid-cols-3">
          <MetaCell label="Part">
            {capa.part ? (
              <>
                <span className="font-mono font-medium">{capa.part.part_number}</span>
                {capa.part.description && (
                  <span className="ml-2 text-muted-foreground">{capa.part.description}</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </MetaCell>
          <MetaCell label="Defect Code">
            <span className="font-mono">{capa.defect_code ?? "—"}</span>
          </MetaCell>
          <MetaCell label="Source">
            <span className="capitalize">{capa.source}</span>
          </MetaCell>
        </CardContent>
      </Card>

      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-5">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              disabled={!t.unlocked}
              className="flex items-center gap-2 py-2 text-xs sm:text-sm"
            >
              {t.unlocked ? <t.icon className="h-4 w-4" /> : <Lock className="h-3 w-3" />}
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(" ")[0]}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="problem">
          <ProblemTab capa={capa} onSaved={refetch} />
        </TabsContent>
        <TabsContent value="5why">
          {tabUnlocked(capa.status, 2) ? (
            <FiveWhyTab capa={capa} onSaved={refetch} />
          ) : (
            <LockedNotice message="Complete the Problem tab first." />
          )}
        </TabsContent>
        <TabsContent value="actions">
          {tabUnlocked(capa.status, 3) ? (
            <ActionPlanTab capa={capa} onSaved={refetch} />
          ) : (
            <LockedNotice message="Complete the 5-Why analysis first." />
          )}
        </TabsContent>
        <TabsContent value="approval">
          {tabUnlocked(capa.status, 4) && meta ? (
            <ApprovalTab capa={capa} meta={meta} onSaved={refetch} />
          ) : (
            <LockedNotice message="Complete the 5-Why analysis first." />
          )}
        </TabsContent>
        <TabsContent value="effectiveness">
          {tabUnlocked(capa.status, 5) ? (
            <EffectivenessTab capa={capa} onSaved={refetch} />
          ) : (
            <LockedNotice message="Get full approval first." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function LockedNotice({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Lock className="h-4 w-4" />
        {message}
      </CardContent>
    </Card>
  )
}

/**
 * Pick a sensible default active tab based on current CAPA status —
 * jumps the user straight to the tab they need to work on next.
 */
function activeTabForStatus(status: string): string {
  switch (status) {
    case "open":
      return "problem"
    case "root_cause_pending":
      return "5why"
    case "action_plan_pending":
      return "actions"
    case "approved":
    case "in_progress":
    case "closed":
    case "ineffective":
      return "effectiveness"
    default:
      return "problem"
  }
}
