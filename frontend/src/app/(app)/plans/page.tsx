"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ClipboardList, Search, Loader2, ChevronLeft, ChevronRight, Upload,
} from "lucide-react"
import { CsvImportDialog } from "@/components/csv-import-dialog"
import { useAuthStore } from "@/lib/auth-store"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

interface PlanRow {
  id: number
  plan_number: string
  plan_name: string
  status: "draft" | "active" | "superseded"
  balloon_count: number
  characteristic_count: number
  documents_count?: number
  balloons_count?: number
  characteristics_count?: number
  created_at: string
  part: { id: number; part_number: string; revision: string; description: string } | null
  creator: { id: number; name: string } | null
}

const statusVariant: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  draft: "outline",
  superseded: "secondary",
}

export default function PlansListPage() {
  const { hasPermission } = useAuthStore()
  const canCreate = hasPermission("plans.create")
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState("")

  const fetchPlans = async (pageNum = 1) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get("/plans", {
        params: {
          page: pageNum,
          status: statusFilter === "all" ? undefined : statusFilter,
          per_page: 25,
        },
      })
      setPlans(data.data || [])
      setLastPage(data.last_page || 1)
      setPage(data.current_page || 1)
      setTotal(data.total || 0)
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load plans"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlans(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const filtered = search
    ? plans.filter((p) => {
        const term = search.toLowerCase()
        return (
          p.plan_number.toLowerCase().includes(term) ||
          p.plan_name.toLowerCase().includes(term) ||
          p.part?.part_number?.toLowerCase().includes(term)
        )
      })
    : plans

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inspection Plans</h1>
          <p className="text-sm text-muted-foreground">
            Bubble prints across all parts — open one to add balloons or use it for inspections
          </p>
        </div>
        {canCreate && (
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
        )}
      </div>

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="plans"
        onDone={() => { void fetchPlans(page); }}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4" />
                {loading ? "Loading..." : `${total} plan${total !== 1 ? "s" : ""}`}
              </CardTitle>
              <CardDescription>Click a plan to open the drawing workspace</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="w-72 pl-9"
                  placeholder="Search plan #, name, part #..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="superseded">Superseded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <ErrorState
              title="Failed to load plans"
              description={error}
              onRetry={() => fetchPlans(page)}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={search ? "No matching plans" : "No plans yet"}
              description={
                search
                  ? "Try a different search term."
                  : "Open a part to create the first inspection plan."
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((p) => {
                  const balloons = p.balloons_count ?? p.balloon_count ?? 0
                  const chars = p.characteristics_count ?? p.characteristic_count ?? 0
                  const docs = p.documents_count ?? 0
                  return (
                    <Link
                      key={p.id}
                      href={`/plans/${p.id}/workspace`}
                      className="flex flex-col gap-2 rounded-lg border bg-card p-4 transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">{p.plan_number}</span>
                        <Badge variant={statusVariant[p.status] || "outline"}>{p.status}</Badge>
                      </div>
                      <div className="line-clamp-2 text-sm" title={p.plan_name}>
                        {p.plan_name}
                      </div>
                      {p.part && (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{p.part.part_number}</span>{" "}
                          <span className="text-muted-foreground">Rev {p.part.revision}</span>
                          <div className="line-clamp-1">{p.part.description}</div>
                        </div>
                      )}
                      <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{docs} doc{docs === 1 ? "" : "s"}</span>
                        <span>·</span>
                        <span>{balloons} balloon{balloons === 1 ? "" : "s"}</span>
                        <span>·</span>
                        <span>{chars} char{chars === 1 ? "" : "s"}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>

              {lastPage > 1 && (
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {lastPage}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchPlans(page - 1)}
                      disabled={page <= 1 || loading}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchPlans(page + 1)}
                      disabled={page >= lastPage || loading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
