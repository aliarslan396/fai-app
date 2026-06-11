"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  Search, Package, ClipboardList, ArrowRight, Plus, Loader2,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { WorkflowProgress } from "@/components/workflow-progress"
import { PlanFormDialog, type InspectionPlan } from "@/components/plan-form-dialog"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"

interface Part {
  id: number
  part_number: string
  revision: string
  description: string
  customer?: { id: number; name: string; code: string | null } | null
  material: string | null
  status: string
}

export default function WorkflowStartPage() {
  const router = useRouter()
  const { hasPermission } = useAuthStore()

  const [search, setSearch] = useState("")
  const [parts, setParts] = useState<Part[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPart, setSelectedPart] = useState<Part | null>(null)
  const [plans, setPlans] = useState<InspectionPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [planFormOpen, setPlanFormOpen] = useState(false)
  const [continuing, setContinuing] = useState(false)

  const canCreateInspection = hasPermission("inspections.create")
  const canCreatePlan = hasPermission("plans.create")

  // Debounced part search
  useEffect(() => {
    if (search.trim().length < 1) {
      setParts([])
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      api
        .get("/parts", { params: { search: search.trim(), status: "active", per_page: 10 } })
        .then((res) => setParts(res.data.data || []))
        .catch(() => setParts([]))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  // Load plans for the selected part
  const loadPlans = useCallback(async (partId: number) => {
    setPlansLoading(true)
    try {
      const { data } = await api.get("/plans", {
        params: { part_id: partId, status: "active", per_page: 50 },
      })
      setPlans(data.data || [])
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load plans"))
    } finally {
      setPlansLoading(false)
    }
  }, [])

  const pickPart = (p: Part) => {
    setSelectedPart(p)
    setSearch("")
    setParts([])
    setSelectedPlanId(null)
    loadPlans(p.id)
  }





  

  const onPlanCreated = (plan: InspectionPlan) => {
    setPlans((prev) => [plan, ...prev])
    setSelectedPlanId(plan.id)
  }

  const continueToStep3 = async () => {
    if (!selectedPart || !selectedPlanId) return
    setContinuing(true)
    try {
      const { data } = await api.post("/workflow/sessions", {
        part_id: selectedPart.id,
        inspection_plan_id: selectedPlanId,
      })
      router.push(`/workflow/new-inspection/${data.session.id}`)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to start inspection"))
    } finally {
      setContinuing(false)
    }
  }

  if (!canCreateInspection) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        You do not have permission to start inspections.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Inspection</h1>
        <p className="text-sm text-muted-foreground">
          Select the part being inspected and the plan that defines its characteristics.
        </p>
      </div>

      <WorkflowProgress currentStep={selectedPlanId ? 3 : selectedPart ? 2 : 1} completedSteps={selectedPlanId ? [1, 2] : selectedPart ? [1] : []} />

      {/* Panel A — Part */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" />
                Step 1 — Part
              </CardTitle>
              <CardDescription>Active parts only</CardDescription>
            </div>
            {selectedPart && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedPart(null)
                  setSelectedPlanId(null)
                  setPlans([])
                }}
              >
                Change
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {selectedPart ? (
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-lg font-semibold">
                    {selectedPart.part_number}{" "}
                    <span className="text-muted-foreground">Rev {selectedPart.revision}</span>
                  </div>
                  <div className="mt-1 text-sm">{selectedPart.description}</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {selectedPart.customer && (
                      <span>
                        Customer: <strong>{selectedPart.customer.name}</strong>
                      </span>
                    )}
                    {selectedPart.material && <span>Material: {selectedPart.material}</span>}
                  </div>
                </div>
                <Badge>{selectedPart.status}</Badge>
              </div>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Type part number, revision, or description..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>

              {parts.length > 0 && (
                <div className="mt-2 overflow-hidden rounded-lg border">
                  {parts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => pickPart(p)}
                      className="flex w-full items-center justify-between border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"
                    >
                      <div>
                        <div className="font-mono text-sm">
                          {p.part_number}{" "}
                          <span className="text-muted-foreground">Rev {p.revision}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      </div>
                      {p.customer && (
                        <span className="ml-2 truncate text-xs text-muted-foreground">
                          {p.customer.name}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {search.length >= 1 && !searching && parts.length === 0 && (
                <div className="mt-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  No active parts match.{" "}
                  <Link href="/parts" className="text-primary hover:underline">
                    Add a new part →
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Panel B — Plan */}
      {selectedPart && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4" />
                  Step 2 — Inspection Plan
                </CardTitle>
                <CardDescription>Active plans for this part</CardDescription>
              </div>
              {canCreatePlan && (
                <Button size="sm" variant="outline" onClick={() => setPlanFormOpen(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New plan
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {plansLoading ? (
              <div className="flex h-16 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : plans.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                No active plans yet for this part.
                {canCreatePlan && (
                  <div className="mt-3">
                    <Button size="sm" onClick={() => setPlanFormOpen(true)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Create plan
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {plans.map((p) => {
                  const selected = selectedPlanId === p.id
                  const balloons = p.balloons_count ?? p.balloon_count ?? 0
                  const chars = p.characteristics_count ?? p.characteristic_count ?? 0
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlanId(p.id)}
                      className={`flex flex-col gap-2 rounded-lg border-2 bg-card p-3 text-left transition-colors ${
                        selected
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-border hover:border-muted-foreground/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">{p.plan_number}</span>
                        {selected && <Badge>Selected</Badge>}
                      </div>
                      <p className="line-clamp-2 text-sm" title={p.plan_name}>
                        {p.plan_name}
                      </p>
                      <div className="mt-auto text-xs text-muted-foreground">
                        {balloons} balloons · {chars} chars
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Continue */}
      {selectedPart && (
        <div className="flex items-center justify-between border-t pt-4">
          <div className="text-sm text-muted-foreground">
            {selectedPlanId
              ? "Ready to start the inspection."
              : "Select an inspection plan to continue."}
          </div>
          <Button onClick={continueToStep3} disabled={!selectedPlanId || continuing}>
            {continuing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="mr-2 h-4 w-4" />
            )}
            Continue to inspection
          </Button>
        </div>
      )}

      {selectedPart && (
        <PlanFormDialog
          open={planFormOpen}
          onOpenChange={setPlanFormOpen}
          partId={selectedPart.id}
          onSaved={onPlanCreated}
        />
      )}
    </div>
  )
}
