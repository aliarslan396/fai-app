"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Save, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getErrorMessage } from "@/lib/errors"
import { apiRefineProblem, type Capa } from "@/lib/capas"

/**
 * Tab 1 — Problem definition + immediate containment.
 * Saving the first time transitions status open → root_cause_pending
 * and unlocks Tab 2.
 */
export function ProblemTab({ capa, onSaved }: { capa: Capa; onSaved: () => void }) {
  const [problem, setProblem] = useState(capa.problem_statement ?? "")
  const [containment, setContainment] = useState(capa.containment_action ?? "")
  const [busy, setBusy] = useState(false)

  const locked = capa.status === "closed" || capa.status === "ineffective"

  async function save() {
    if (!problem.trim() || !containment.trim()) {
      toast.error("Both fields are required")
      return
    }
    setBusy(true)
    try {
      await apiRefineProblem(capa.id, {
        problem_statement: problem.trim(),
        containment_action: containment.trim(),
      })
      toast.success("Problem definition saved")
      onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Problem Statement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="problem">
            What went wrong? Be specific — part, defect, quantity.
          </Label>
          <Textarea
            id="problem"
            rows={5}
            placeholder="e.g. Bore diameter on Part 12345-A measured 0.502 in (spec 0.500 ± 0.001). Discovered on lot 7788 during final inspection. 12 of 50 units affected."
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            disabled={busy || locked}
          />
        </CardContent>
      </Card>

      <Card className="border-red-200 bg-red-50/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-red-900">
            <ShieldAlert className="h-4 w-4" />
            Containment Action
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="containment">
            What did we do <em>right now</em> to stop the bleeding? (before root cause analysis)
          </Label>
          <Textarea
            id="containment"
            rows={3}
            placeholder="e.g. Quarantined all lot 7788 units in Bin 3-B. Stopped shipment of open POs 4471, 4472. Notified customer QA."
            value={containment}
            onChange={(e) => setContainment(e.target.value)}
            disabled={busy || locked}
          />
        </CardContent>
      </Card>

      {!locked && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" /> Save Problem & Containment
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
