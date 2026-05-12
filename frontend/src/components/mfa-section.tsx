"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, ShieldOff, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import api from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { getErrorMessage } from "@/lib/errors"

type Mode = "idle" | "setup" | "disable"

interface SetupData {
  secret: string
  otpauth_uri: string
  qr_code_svg: string
}

export function MfaSection() {
  const { user, fetchMe } = useAuthStore()
  const [mode, setMode] = useState<Mode>("idle")
  const [setupData, setSetupData] = useState<SetupData | null>(null)
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  const enabled = user?.two_factor_enabled === true

  const startSetup = async () => {
    setBusy(true)
    try {
      const { data } = await api.post("/auth/mfa/setup")
      setSetupData(data)
      setMode("setup")
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to start MFA setup"))
    } finally {
      setBusy(false)
    }
  }

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== 6) return

    setBusy(true)
    try {
      await api.post("/auth/mfa/confirm", { code })
      await fetchMe()
      toast.success("MFA enabled successfully")
      setMode("idle")
      setSetupData(null)
      setCode("")
    } catch (err) {
      toast.error(getErrorMessage(err, "Invalid code"))
    } finally {
      setBusy(false)
    }
  }

  const disable = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post("/auth/mfa/disable", { password, code })
      await fetchMe()
      toast.success("MFA disabled")
      setMode("idle")
      setPassword("")
      setCode("")
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to disable MFA"))
    } finally {
      setBusy(false)
    }
  }

  const cancelSetup = () => {
    setMode("idle")
    setSetupData(null)
    setCode("")
    setPassword("")
  }

  if (mode === "setup" && setupData) {
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h3 className="text-base font-medium">Set up two-factor authentication</h3>
          <p className="text-sm text-muted-foreground">
            Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <div className="rounded-lg border bg-white p-4">
              <div
                className="aspect-square w-full"
                dangerouslySetInnerHTML={{ __html: setupData.qr_code_svg }}
              />
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div className="mb-1 font-medium text-muted-foreground">Can't scan? Enter manually:</div>
              <code className="break-all font-mono">{setupData.secret}</code>
            </div>
          </div>

          <form onSubmit={confirmSetup} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="setup_code">Enter the 6-digit code</Label>
              <Input
                id="setup_code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="text-center font-mono text-xl tracking-widest"
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                Code refreshes every 30 seconds. If the first one doesn't work, try the next.
              </p>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={busy || code.length !== 6} className="flex-1">
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Enable MFA
                  </>
                )}
              </Button>
              <Button type="button" variant="ghost" onClick={cancelSetup} disabled={busy}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Compatible apps:</strong> Google Authenticator, Microsoft Authenticator, Authy, 1Password
        </div>
      </div>
    )
  }

  if (mode === "disable") {
    return (
      <form onSubmit={disable} className="space-y-4 max-w-md" noValidate>
        <div className="space-y-1">
          <h3 className="text-base font-medium">Disable two-factor authentication</h3>
          <p className="text-sm text-muted-foreground">
            Confirm your password and current 6-digit code to turn off MFA.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dis_password">Current password</Label>
          <PasswordInput
            id="dis_password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoComplete="current-password"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dis_code">Current 6-digit code</Label>
          <Input
            id="dis_code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="font-mono"
            disabled={busy}
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="submit"
            variant="destructive"
            disabled={busy || code.length !== 6 || !password}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Disabling...
              </>
            ) : (
              <>
                <ShieldOff className="mr-2 h-4 w-4" />
                Disable MFA
              </>
            )}
          </Button>
          <Button type="button" variant="ghost" onClick={cancelSetup} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    )
  }

  // Idle state
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-medium">Authenticator app</h3>
            {enabled ? (
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Enabled
              </Badge>
            ) : (
              <Badge variant="secondary">Disabled</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {enabled
              ? "MFA is active. You'll need a 6-digit code from your authenticator app to sign in."
              : "Add an extra layer of security by requiring a 6-digit code on every sign-in."}
          </p>
        </div>

        <div className="shrink-0">
          {enabled ? (
            <Button variant="outline" onClick={() => setMode("disable")}>
              <ShieldOff className="mr-2 h-4 w-4" />
              Disable
            </Button>
          ) : (
            <Button onClick={startSetup} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              Enable MFA
            </Button>
          )}
        </div>
      </div>

      {!enabled && (
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              You'll need an authenticator app on your phone: Google Authenticator, Microsoft
              Authenticator, Authy, or 1Password.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
