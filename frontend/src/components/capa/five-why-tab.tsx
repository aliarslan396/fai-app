"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Loader2, Save, Target } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getErrorMessage } from "@/lib/errors"
import {
  apiCompleteRootCause,
  apiSaveFiveWhy,
  type Capa,
  type CapaFiveWhyRow,
} from "@/lib/capas"

/**
 * Tab 2 — 5-Why root-cause chain. Progressive lock: level N can only
 * be edited after level N-1 is saved. Once all 5 exist and a summary
 * is entered, "Complete Root Cause" transitions to action_plan_pending.
 */
export function FiveWhyTab({ capa, onSaved }: { capa: Capa; onSaved: () => void }) {
  const whys = (capa.five_whys ?? []).sort((a, b) => a.level - b.level)
  const nextLevel = whys.length + 1
  const allDone = whys.length >= 5

  const locked = capa.status === "closed" || capa.status === "ineffective"

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="py-3 text-sm text-blue-900">
          Ask &quot;why&quot; five times. Start from the visible defect and drill down
          to the systemic cause. Each answer becomes the next question.
        </CardContent>
      </Card>

      {whys.map((w) => (
        <WhyRow key={w.id} row={w} readOnly locked={locked} onSaved={onSaved} capaId={capa.id} />
      ))}

      {!allDone && !locked && nextLevel <= 5 && capa.status !== "open" && (
        <WhyRow
          row={{ level: nextLevel } as CapaFiveWhyRow}
          locked={locked}
          onSaved={onSaved}
          capaId={capa.id}
        />
      )}

      {allDone && (
        <RootCauseSummary capa={capa} onSaved={onSaved} locked={locked} />
      )}
    </div>
  )
}

function WhyRow({
  row,
  capaId,
  readOnly = false,
  locked,
  onSaved,
}: {
  row: CapaFiveWhyRow
  capaId: number
  readOnly?: boolean
  locked: boolean
  onSaved: () => void
}) {
  const [text, setText] = useState(row.why_text ?? "")
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!text.trim()) {
      toast.error(`Level ${row.level} needs an answer`)
      return
    }
    setBusy(true)
    try {
      await apiSaveFiveWhy(capaId, row.level, text.trim())
      toast.success(`Level ${row.level} saved`)
      onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {row.level}
          </span>
          Why #{row.level}
          {readOnly && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {readOnly ? (
          <div className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
            {row.why_text}
          </div>
        ) : (
          <>
            <Textarea
              rows={2}
              placeholder={`Because...`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy || locked}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={save} disabled={busy || locked}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Saving
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-3 w-3" /> Save Level {row.level}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function RootCauseSummary({
  capa,
  onSaved,
  locked,
}: {
  capa: Capa
  onSaved: () => void
  locked: boolean
}) {
  const [summary, setSummary] = useState(capa.root_cause_summary ?? "")
  const [busy, setBusy] = useState(false)

  const alreadySet = capa.status !== "root_cause_pending"

  async function save() {
    if (!summary.trim()) {
      toast.error("Root cause summary required")
      return
    }
    setBusy(true)
    try {
      await apiCompleteRootCause(capa.id, summary.trim())
      toast.success("Root cause locked in — Action Plan unlocked")
      onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-emerald-900">
          <Target className="h-4 w-4" />
          Root Cause Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="rc-summary">
          One-line summary of the actual root cause (derived from level 5).
        </Label>
        <Textarea
          id="rc-summary"
          rows={3}
          placeholder="e.g. Tool wear not tracked in preventive maintenance schedule — no trigger for replacement."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={busy || locked || alreadySet}
        />
        {!alreadySet && !locked && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Locking in
                </>
              ) : (
                <>Complete Root Cause & Unlock Actions</>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
