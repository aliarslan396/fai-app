"use client"

import { forwardRef, useImperativeHandle } from "react"
import Link from "next/link"
import { AlertTriangle, Loader2, ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DISPOSITION_LABEL,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  useNcrs,
} from "@/lib/ncrs"

interface Props {
  sessionId: number
}

export interface RelatedNcrsPanelHandle {
  refetch: () => void
}

/**
 * Compact NCR summary strip that sits above the characteristic table
 * on Form 3 / Custom Report pages. Fetches NCRs scoped to the current
 * inspection session so inspectors see defect history at a glance.
 *
 * Parents call `ref.current?.refetch()` after creating a new NCR so
 * the strip picks up the new row without a page refresh.
 */
export const RelatedNcrsPanel = forwardRef<RelatedNcrsPanelHandle, Props>(function RelatedNcrsPanel(
  { sessionId },
  ref,
) {
  const { ncrs, loading, error, refetch } = useNcrs({ sessionId })

  useImperativeHandle(ref, () => ({ refetch }), [refetch])

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading NCRs…
        </CardContent>
      </Card>
    )
  }

  if (error || ncrs.length === 0) {
    return null
  }

  const open = ncrs.filter((n) => n.status === "open").length
  const dispositioned = ncrs.filter((n) => n.status === "dispositioned").length
  const closed = ncrs.filter((n) => n.status === "closed").length

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Related NCRs ({ncrs.length})
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {open > 0 && <span className="mr-2 text-red-700">{open} open</span>}
            {dispositioned > 0 && <span className="mr-2 text-amber-700">{dispositioned} dispositioned</span>}
            {closed > 0 && <span className="text-emerald-700">{closed} closed</span>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2">
          {ncrs.map((n) => (
            <Link
              key={n.id}
              href={`/ncr/${n.id}`}
              className="group flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs transition-colors hover:bg-muted"
            >
              <span className="font-mono font-medium">{n.ncr_number}</span>
              {n.characteristic_ref && (
                <span className="text-muted-foreground">
                  · Char {n.characteristic_ref}
                </span>
              )}
              <Badge variant="outline" className={`ml-1 text-[9px] py-0 ${SEVERITY_COLOR[n.severity]}`}>
                {SEVERITY_LABEL[n.severity]}
              </Badge>
              <Badge variant="outline" className={`text-[9px] py-0 ${STATUS_COLOR[n.status]}`}>
                {STATUS_LABEL[n.status]}
              </Badge>
              {n.status !== "open" && (
                <span className="text-[10px] text-muted-foreground">
                  {DISPOSITION_LABEL[n.disposition]}
                </span>
              )}
              <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
})
