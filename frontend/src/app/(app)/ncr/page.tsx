"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, Plus, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CreateNcrDialog } from "@/components/ncr/create-ncr-dialog"
import { useAuthStore } from "@/lib/auth-store"
import {
  DISPOSITION_LABEL,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  useNcrs,
  type NcrDisposition,
  type NcrStatus,
} from "@/lib/ncrs"

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  } catch {
    return iso
  }
}

export default function NcrListPage() {
  const { hasPermission } = useAuthStore()
  const canCreate = hasPermission("ncr.create")
  const [statusFilter, setStatusFilter] = useState<NcrStatus | "">("")
  const [dispositionFilter, setDispositionFilter] = useState<NcrDisposition | "">("")
  const [createOpen, setCreateOpen] = useState(false)

  const { ncrs, loading, error, refetch, total } = useNcrs({
    status: statusFilter,
    disposition: dispositionFilter,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
            Non-Conformance Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Log defects, route dispositions, close out with corrective action.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            New NCR
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">All NCRs {total > 0 && <span className="text-muted-foreground">({total})</span>}</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : (v as NcrStatus))}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="dispositioned">Dispositioned</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dispositionFilter || "all"} onValueChange={(v) => setDispositionFilter(v === "all" ? "" : (v as NcrDisposition))}>
                <SelectTrigger className="h-8 w-48">
                  <SelectValue placeholder="All dispositions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All dispositions</SelectItem>
                  {(Object.keys(DISPOSITION_LABEL) as NcrDisposition[]).map((d) => (
                    <SelectItem key={d} value={d}>
                      {DISPOSITION_LABEL[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading NCRs…
            </div>
          )}

          {!loading && error && (
            <div className="p-6 text-sm text-destructive">{error}</div>
          )}

          {!loading && !error && ncrs.length === 0 && (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No NCRs match the current filters.
              {canCreate && (
                <>
                  <br />
                  <Button variant="link" size="sm" onClick={() => setCreateOpen(true)}>
                    Create the first one →
                  </Button>
                </>
              )}
            </div>
          )}

          {!loading && !error && ncrs.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">NCR #</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead>Char / Requirement</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Disposition</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Created By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ncrs.map((n) => (
                  <TableRow key={n.id} className="cursor-pointer">
                    <TableCell className="font-mono">
                      <Link href={`/ncr/${n.id}`} className="text-primary hover:underline">
                        {n.ncr_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {n.part ? (
                        <span>
                          <span className="font-medium">{n.part.part_number}</span>
                          {n.part.description && (
                            <span className="ml-1 text-xs text-muted-foreground">{n.part.description}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        {n.characteristic_ref && <span className="font-medium">Char {n.characteristic_ref} · </span>}
                        <span className="text-muted-foreground">{n.requirement ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{n.actual_result ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={SEVERITY_COLOR[n.severity]}>
                        {SEVERITY_LABEL[n.severity]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{DISPOSITION_LABEL[n.disposition]}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLOR[n.status]}>
                        {STATUS_LABEL[n.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(n.created_at)}</TableCell>
                    <TableCell className="text-xs">{n.creator?.name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateNcrDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void refetch()}
      />
    </div>
  )
}
