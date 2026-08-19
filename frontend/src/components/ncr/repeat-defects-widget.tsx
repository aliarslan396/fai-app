"use client"

import Link from "next/link"
import { AlertOctagon, ChevronRight, GitBranch, Loader2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/empty-state"
import { useNcrRepeats } from "@/lib/ncr-repeats"
import { Inbox } from "lucide-react"

/**
 * Dashboard card that surfaces (part, defect) combos with 3+ NCRs
 * in the last 30 days. Each row jumps to the latest NCR so the QM
 * can either (a) escalate to CAPA if no CAPA covers it yet, or
 * (b) click through to the existing CAPA if one already does.
 */
export function RepeatDefectsWidget() {
  const { data, loading } = useNcrRepeats(30, 3)

  const clusters = data?.clusters ?? []

  return (
    <Card className="border-red-200 bg-red-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertOctagon className="h-5 w-5 text-red-700" />
          Repeat Defects (last 30 days)
          {clusters.length > 0 && (
            <span className="ml-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
              {clusters.length}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Part + defect combos hitting the CAPA-escalation threshold (3+ NCRs)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : clusters.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No repeat defects"
            description="No part+defect combo has recurred 3+ times in the last 30 days."
          />
        ) : (
          <ul className="space-y-1">
            {clusters.map((c) => {
              const key = `${c.part_id}-${c.defect_code}`
              const target = c.existing_capa_id
                ? `/capa/${c.existing_capa_id}`
                : c.latest_ncr
                  ? `/ncr/${c.latest_ncr.id}`
                  : `/ncr?part_id=${c.part_id}&defect_code=${encodeURIComponent(c.defect_code)}`
              return (
                <li key={key}>
                  <Link
                    href={target}
                    className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-red-100/50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
                      <AlertOctagon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 text-sm">
                        <span className="font-mono font-medium">
                          {c.part?.part_number ?? `Part #${c.part_id}`}
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-mono">{c.defect_code}</span>
                        <Badge
                          variant="outline"
                          className="ml-1 border-red-300 bg-red-100 text-red-800"
                        >
                          {c.ncr_count} NCRs
                        </Badge>
                        {c.existing_capa_id && (
                          <Badge
                            variant="outline"
                            className="border-purple-300 bg-purple-50 text-purple-800"
                          >
                            <GitBranch className="mr-1 h-3 w-3" />
                            CAPA open
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {c.part?.description && <>{c.part.description} · </>}
                        Latest: {c.latest_ncr?.ncr_number ?? "—"} · Since{" "}
                        {new Date(c.first_at).toLocaleDateString()}
                      </div>
                    </div>
                    <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
