"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, FileCheck, FileText, Loader2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { WorkflowProgress } from "@/components/workflow-progress"
import { ErrorState } from "@/components/error-state"
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
  part: {
    id: number
    part_number: string
    revision: string
    description: string
    customer?: { id: number; name: string; code: string | null } | null
  } | null
  plan: {
    id: number
    plan_number: string
    plan_name: string
    balloon_count: number
    characteristic_count: number
  } | null
}

interface AutoFilled {
  part_number: string | null
  part_name: string | null
  revision: string | null
  customer: string | null
  drawing_number: string | null
  inspector_name: string | null
  inspector_email: string | null
  date: string | null
}

export default function NewInspectionPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [session, setSession] = useState<Session | null>(null)
  const [autoFilled, setAutoFilled] = useState<AutoFilled | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Selected report type — defaults to session's current value
  const [type, setType] = useState<"as9102" | "custom">("as9102")

  // Manual fields (AS9102 + custom share serial/po)
  const [serial, setSerial] = useState("")
  const [poNumber, setPoNumber] = useState("")
  const [faiIdentifier, setFaiIdentifier] = useState("")
  const [mfgProcessRef, setMfgProcessRef] = useState("")
  const [orgName, setOrgName] = useState("")
  const [supplierCode, setSupplierCode] = useState("")
  const [reportTitle, setReportTitle] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [inspectionType, setInspectionType] = useState<"receiving" | "in_process" | "final" | "other">("final")

  const fetchSession = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get(`/workflow/sessions/${params.id}`)
      setSession(data.session)
      setAutoFilled(data.auto_filled)
      setType(data.session.session_type)
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load session"))
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  const submit = async () => {
    if (!session) return
    setCreating(true)
    try {
      await api.post(`/workflow/sessions/${session.id}/step3`, {
        session_type: type,
        // Manual fields are stored on the session for now; Modules 4.4/4.5
        // will move them to fai_form1 / custom_inspection_reports rows.
        serial_number: serial,
        po_number: poNumber,
        fai_identifier: faiIdentifier,
        mfg_process_ref: mfgProcessRef,
        org_name: orgName,
        supplier_code: supplierCode,
        report_title: reportTitle,
        quantity: parseInt(quantity, 10) || 1,
        inspection_type: inspectionType,
      })
      toast.success("Inspection started")
      if (type === "as9102") {
        router.push(`/inspections/${session.id}/form3`)
      } else {
        // Custom (DEF-QA-003) form lands in Module 4.5 — back to dashboard for now
        toast.info("DEF-QA-003 entry page coming in Module 4.5")
        router.push("/dashboard")
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to start inspection"))
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !session) {
    return <ErrorState title="Failed to load" description={error || "Not found"} onRetry={fetchSession} />
  }

  const completedSteps: number[] = []
  if (session.step1_complete) completedSteps.push(1)
  if (session.step2_complete) completedSteps.push(2)
  if (session.step3_complete) completedSteps.push(3)

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push("/workflow/start")} className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to part/plan selection
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Step 3 — Start Inspection</h1>
        <p className="text-sm text-muted-foreground">
          Choose report type and fill in inspection-specific fields. Common headers
          are auto-filled from the part and plan.
        </p>
      </div>

      <WorkflowProgress currentStep={3} completedSteps={completedSteps} sessionId={session.id} />

      {/* Type selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report type</CardTitle>
          <CardDescription>Pick the inspection format for this run</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setType("as9102")}
              className={`flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-colors ${
                type === "as9102"
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <FileCheck className="h-5 w-5 text-primary" />
              <div className="font-semibold">AS9102 FAI</div>
              <div className="text-xs text-muted-foreground">
                Aerospace standard. Form 1 (header), Form 2 (materials), Form 3 (characteristics). Excel + PDF export.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setType("custom")}
              className={`flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-colors ${
                type === "custom"
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <FileText className="h-5 w-5 text-primary" />
              <div className="font-semibold">Custom Inspection Report</div>
              <div className="text-xs text-muted-foreground">
                DEF-QA-003 internal format. Single-sheet 20-row table. PDF only.
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Auto-filled */}
      {autoFilled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Auto-filled header</CardTitle>
            <CardDescription>From the selected part + plan + your session</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
              {[
                ["Part Number", autoFilled.part_number],
                ["Part Name", autoFilled.part_name],
                ["Revision", autoFilled.revision],
                ["Customer", autoFilled.customer],
                ["Drawing Number", autoFilled.drawing_number],
                ["Inspector", autoFilled.inspector_name],
                ["Date", autoFilled.date],
              ].map(([label, val]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 text-sm">
                    <span className="font-medium">{val || "—"}</span>
                    {val && <Badge variant="secondary" className="text-[10px]">Auto</Badge>}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Manual fields — split by type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inspection-specific fields</CardTitle>
          <CardDescription>You fill these in</CardDescription>
        </CardHeader>
        <CardContent>
          {type === "as9102" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fai-ident">FAI Identifier</Label>
                <Input id="fai-ident" value={faiIdentifier} onChange={(e) => setFaiIdentifier(e.target.value)} placeholder="FAI-001-A" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="serial">Serial #</Label>
                <Input id="serial" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="SN-0001" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po">PO Number</Label>
                <Input id="po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-2026-44521" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mfg-ref">Mfg Process Reference</Label>
                <Input id="mfg-ref" value={mfgProcessRef} onChange={(e) => setMfgProcessRef(e.target.value)} placeholder="MPR-12345" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org">Org Name</Label>
                <Input id="org" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="ADMI Manufacturing" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier">Supplier Code</Label>
                <Input id="supplier" value={supplierCode} onChange={(e) => setSupplierCode(e.target.value)} placeholder="88277" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="title">Report Title</Label>
                <Input id="title" value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} placeholder="Final inspection report" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="serial-c">Serial / Lot #</Label>
                <Input id="serial-c" value={serial} onChange={(e) => setSerial(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po-c">Work Order</Label>
                <Input id="po-c" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qty">Quantity</Label>
                <Input id="qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Inspection Type</Label>
                <div className="flex flex-wrap gap-2">
                  {(["receiving", "in_process", "final", "other"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setInspectionType(t)}
                      className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
                        inspectionType === t
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input hover:bg-muted"
                      }`}
                    >
                      {t.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between border-t pt-4">
        <div className="text-sm text-muted-foreground">
          {type === "as9102"
            ? "Step 4 — Form 3 measurement entry opens after you create the inspection."
            : "DEF-QA-003 entry page lands in Module 4.5."}
        </div>
        <Button onClick={submit} disabled={creating}>
          {creating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="mr-2 h-4 w-4" />
          )}
          Create Inspection
        </Button>
      </div>
    </div>
  )
}
