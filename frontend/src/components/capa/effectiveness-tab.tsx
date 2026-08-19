"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CalendarCheck, CheckCircle2, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  apiCloseCapa,
  apiScheduleEffectiveness,
  type Capa,
  type CapaEffectivenessResult,
} from "@/lib/capas"
import { getErrorMessage } from "@/lib/errors"

/**
 * Tab 5 — Effectiveness review + closure.
 * Two phases: (1) schedule a future review date, (2) after that date
 * (and all actions done), record the result and close the CAPA.
 */
export function EffectivenessTab({ capa, onSaved }: { capa: Capa; onSaved: () => void }) {
  const [date, setDate] = useState(capa.effectiveness_review_date ?? defaultReviewDate())
  const [result, setResult] = useState<CapaEffectivenessResult>(
    capa.effectiveness_result ?? "effective",
  )
  const [notes, setNotes] = useState(capa.effectiveness_notes ?? "")
  const [busy, setBusy] = useState(false)

  const closed = capa.status === "closed" || capa.status === "ineffective"

  const canSchedule = capa.status === "approved" || capa.status === "in_progress"
  const canClose = capa.status === "approved" || capa.status === "in_progress"

  const allActionsDone =
    (capa.actions?.length ?? 0) > 0 &&
    (capa.actions ?? []).every((a) => a.status === "done")

  async function schedule() {
    setBusy(true)
    try {
      await apiScheduleEffectiveness(capa.id, date)
      toast.success("Review scheduled")
      onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to schedule"))
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    setBusy(true)
    try {
      await apiCloseCapa(capa.id, result, notes.trim() || undefined)
      toast.success(
        result === "effective" ? "CAPA closed as effective" : `CAPA marked ${result}`,
      )
      onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to close"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4 text-blue-600" />
            Effectiveness Review Date
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label>Review Date (typically 30+ days after actions complete)</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={busy || closed}
              />
            </div>
            <div className="flex items-end">
              {canSchedule && !closed && (
                <Button onClick={schedule} disabled={busy}>
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving
                    </>
                  ) : capa.effectiveness_review_date ? (
                    "Update Date"
                  ) : (
                    "Schedule Review"
                  )}
                </Button>
              )}
            </div>
          </div>
          {capa.effectiveness_review_date && (
            <div className="text-xs text-muted-foreground">
              Currently scheduled: {new Date(capa.effectiveness_review_date).toLocaleDateString()}
            </div>
          )}
        </CardContent>
      </Card>

      {closed ? (
        <ClosedSummary capa={capa} />
      ) : canClose ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Record Review Outcome</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!allActionsDone && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                All action items must be marked done before closing. Return to Action Plan.
              </div>
            )}
            <div className="space-y-1">
              <Label>Result</Label>
              <Select value={result} onValueChange={(v) => setResult(v as CapaEffectivenessResult)}>
                <SelectTrigger disabled={busy}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="effective">Effective — defect eliminated</SelectItem>
                  <SelectItem value="partial">Partial — some improvement</SelectItem>
                  <SelectItem value="ineffective">Ineffective — recurred</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Review Notes</Label>
              <Textarea
                rows={3}
                placeholder="What did the review find? Did the defect recur? Any related NCRs?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={close} disabled={busy || !allActionsDone}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Closing
                  </>
                ) : (
                  <>
                    {result === "ineffective" ? (
                      <XCircle className="mr-2 h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Close CAPA
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 bg-slate-50/40">
          <CardContent className="py-3 text-sm text-muted-foreground">
            Close will unlock once the CAPA reaches Approved status.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ClosedSummary({ capa }: { capa: Capa }) {
  const isEffective = capa.effectiveness_result === "effective"
  return (
    <Card className={isEffective ? "border-emerald-200 bg-emerald-50/40" : "border-orange-200 bg-orange-50/40"}>
      <CardHeader className="pb-3">
        <CardTitle className={`text-base ${isEffective ? "text-emerald-900" : "text-orange-900"}`}>
          Closure Record
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div>
          <span className="font-medium">Result:</span>{" "}
          <Badge
            variant="outline"
            className={
              isEffective
                ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                : "border-orange-300 bg-orange-100 text-orange-800"
            }
          >
            {capa.effectiveness_result}
          </Badge>
        </div>
        {capa.closed_at && (
          <div>
            <span className="font-medium">Closed:</span>{" "}
            {new Date(capa.closed_at).toLocaleString()}
            {capa.closer && <> by {capa.closer.name}</>}
          </div>
        )}
        {capa.effectiveness_notes && (
          <div>
            <div className="font-medium">Notes</div>
            <div className="whitespace-pre-wrap rounded-md border bg-background p-2 text-sm">
              {capa.effectiveness_notes}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function defaultReviewDate() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}
