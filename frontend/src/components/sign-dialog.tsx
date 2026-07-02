"use client"

import { useRef, useState } from "react"
import { Loader2, PenLine } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

export type SignableType = "FaiForm1" | "CustomInspectionReport"
export type SignatureRole = "inspector" | "qa_manager" | "customer_rep"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  signableType: SignableType
  signableId: number
  /** Roles the inspector can sign as — restricts the dropdown. */
  allowedRoles?: SignatureRole[]
  /** Displayed above the canvas — customer-friendly statement. */
  statement?: string
  onSigned: (signature: {
    id: number
    signature_role: string
    signed_at: string
    stamp_image_path: string | null
    signature_image_path: string
  }) => void
}

const ROLE_LABELS: Record<SignatureRole, string> = {
  inspector: "QA Inspector",
  qa_manager: "QA Manager",
  customer_rep: "Customer Representative",
}

export function SignDialog({
  open,
  onOpenChange,
  signableType,
  signableId,
  allowedRoles = ["inspector", "qa_manager"],
  statement,
  onSigned,
}: Props) {
  const [role, setRole] = useState<SignatureRole>(allowedRoles[0])
  const [password, setPassword] = useState("")
  const [canvasEmpty, setCanvasEmpty] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const padRef = useRef<SignaturePadHandle | null>(null)

  const reset = () => {
    setPassword("")
    setErrors({})
    setCanvasEmpty(true)
    padRef.current?.clear()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    if (padRef.current?.isEmpty() ?? true) {
      setErrors({ canvas: "Draw your signature first." })
      return
    }
    if (!password) {
      setErrors({ password: "Confirm your password to sign." })
      return
    }

    const canvas = padRef.current?.getDataUrl()
    if (!canvas) {
      setErrors({ canvas: "Signature capture failed. Retry." })
      return
    }

    setSubmitting(true)
    try {
      const { data } = await api.post("/signatures", {
        signable_type: signableType,
        signable_id: signableId,
        signature_role: role,
        canvas,
        password,
      })
      toast.success(`Signed as ${ROLE_LABELS[role]}`)
      onSigned(data.signature)
      reset()
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to sign"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4" />
            Sign this form
          </DialogTitle>
          <DialogDescription>
            Once signed, this form locks — no further edits. Password re-verify required.
          </DialogDescription>
        </DialogHeader>

        {statement && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            {statement}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signature-role">Signing as</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as SignatureRole)}
              disabled={submitting || allowedRoles.length === 1}
            >
              <SelectTrigger id="signature-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Your signature</Label>
            <SignaturePad
              ref={padRef}
              width={460}
              height={160}
              onChange={setCanvasEmpty}
            />
            {errors.canvas && <p className="text-xs text-destructive">{errors.canvas}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="signature-password">
              Confirm password <span className="text-destructive">*</span>
            </Label>
            <Input
              id="signature-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your account password"
              disabled={submitting}
              autoComplete="current-password"
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || canvasEmpty || !password}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PenLine className="mr-2 h-4 w-4" />
              )}
              Sign & lock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
