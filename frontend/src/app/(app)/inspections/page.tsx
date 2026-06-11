"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Stamp, Plus, ArrowRight, Loader2,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { useAuthStore } from "@/lib/auth-store"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

interface Session {
  id: number
  session_type: "as9102" | "custom"
  current_step: number
  step1_complete: boolean
  step2_complete: boolean
  step3_complete: boolean
  step4_complete: boolean
  step5_complete: boolean
  step6_complete: boolean
  updated_at: string
  part: { id: number; part_number: string; revision: string; description: string } | null
  plan: { id: number; plan_number: string; plan_name: string } | null
  creator: { id: number; name: string } | null
}

const STEP_LABEL = ["Part", "Plan", "Start", "Actuals", "Sign", "Export"]

function stepHref(s: Session): string {
  if (s.current_step <= 2) return "/workflow/start"
  if (s.current_step === 3) return `/workflow/new-inspection/${s.id}`
  if (s.current_step >= 4 && s.session_type === "as9102") {
    return `/inspections/${s.id}/form3`
  }
  return `/workflow/new-inspection/${s.id}`
}

export default function InspectionsPage() {
  const { hasPermission } = useAuthStore()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canCreate = hasPermission("inspections.create")

  const fetchSessions = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get("/workflow/sessions", { params: { per_page: 50 } })
      setSessions(data.data || [])
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load inspections"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [])

  const active = sessions.filter((s) => !s.step6_complete)
  const completed = sessions.filter((s) => s.step6_complete)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inspections</h1>
          <p className="text-sm text-muted-foreground">
            6-step inspection workflow from part selection through signed report
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/workflow/start">
              <Plus className="mr-2 h-4 w-4" />
              New inspection
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Stamp className="h-4 w-4" />
            Active inspections ({active.length})
          </CardTitle>
          <CardDescription>In progress — pick up where you left off</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-16 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <ErrorState title="Failed to load" description={error} onRetry={fetchSessions} />
          ) : active.length === 0 ? (
            <EmptyState
              icon={Stamp}
              title="No active inspections"
              description="Start a new inspection to begin measuring a part."
              action={canCreate ? { label: "New inspection", onClick: () => (window.location.href = "/workflow/start"), icon: Plus } : undefined}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Current Step</TableHead>
                  <TableHead>Inspector</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">#{s.id}</TableCell>
                    <TableCell>
                      {s.part ? (
                        <div>
                          <div className="font-mono text-sm">
                            {s.part.part_number}{" "}
                            <span className="text-muted-foreground">Rev {s.part.revision}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{s.part.description}</div>
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.plan?.plan_number || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {s.session_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>
                        Step {s.current_step} — {STEP_LABEL[s.current_step - 1]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{s.creator?.name || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={stepHref(s)}>
                          Continue
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {completed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Completed ({completed.length})</CardTitle>
            <CardDescription>Signed and exported</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Inspector</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completed.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">#{s.id}</TableCell>
                    <TableCell>{s.part?.part_number} Rev {s.part?.revision}</TableCell>
                    <TableCell className="font-mono text-xs">{s.plan?.plan_number}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-[10px]">{s.session_type}</Badge></TableCell>
                    <TableCell>{s.creator?.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
