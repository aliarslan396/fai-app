"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useAuthStore } from "@/lib/auth-store"
import { apiApproveCapa, type Capa, type CapaMeta } from "@/lib/capas"
import { getErrorMessage } from "@/lib/errors"

/**
 * Tab 4 — Multi-role approval. Each required role must sign off
 * separately. When the last required role signs, status flips to
 * `approved` and effectiveness scheduling unlocks.
 */
export function ApprovalTab({
  capa,
  meta,
  onSaved,
}: {
  capa: Capa
  meta: CapaMeta
  onSaved: () => void
}) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const requiredRoles = meta.required_approver_roles
  const existing = capa.approved_by ?? []
  const rolesSigned = new Set(existing.map((a) => a.role))
  const myRoles = new Set(useAuthStore((s) => s.user)?.roles?.map((r) => r.name) ?? [])
  const myEligibleRole = requiredRoles.find((r) => myRoles.has(r) && !rolesSigned.has(r))

  const canApprove =
    capa.status === "action_plan_pending" && myEligibleRole !== undefined

  async function approve() {
    setBusy(true)
    try {
      await apiApproveCapa(capa.id, note.trim() || undefined)
      toast.success("Approved")
      setNote("")
      onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to approve"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Required Approvers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {requiredRoles.map((role) => {
            const signed = existing.find((a) => a.role === role)
            return (
              <div key={role} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium capitalize">{role.replaceAll("_", " ")}</div>
                  {signed ? (
                    <div className="text-xs text-muted-foreground">
                      Signed by {signed.user_name} · {new Date(signed.approved_at).toLocaleString()}
                      {signed.note && <div className="mt-1 italic">&quot;{signed.note}&quot;</div>}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Awaiting sign-off</div>
                  )}
                </div>
                {signed ? (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Approved
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                    Pending
                  </Badge>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {canApprove && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-blue-900">
              <ShieldCheck className="h-4 w-4" />
              Your Approval Required ({myEligibleRole?.replaceAll("_", " ")})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Textarea
                rows={2}
                placeholder="Any conditions or context for your approval..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={approve} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" /> Approve as{" "}
                    {myEligibleRole?.replaceAll("_", " ")}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {capa.status === "action_plan_pending" && !canApprove && existing.length < requiredRoles.length && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="py-3 text-sm text-amber-900">
            You don&apos;t hold a required approver role, or you&apos;ve already approved.
            Waiting on: {requiredRoles.filter((r) => !rolesSigned.has(r)).map((r) => r.replaceAll("_", " ")).join(", ")}
          </CardContent>
        </Card>
      )}

      {capa.approved_at && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="py-3 text-sm text-emerald-900">
            Fully approved on {new Date(capa.approved_at).toLocaleString()}. Effectiveness review can now be scheduled.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
