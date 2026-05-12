"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import api from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { getErrorMessage } from "@/lib/errors"
import { applyPrimaryColor } from "@/lib/color"
import { getTenantSlug } from "@/lib/tenant"

export default function MfaChallengePage() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { challengeToken, mfaRequired, setAuth, clearAuth } = useAuthStore()
  const verified = useRef(false)

  useEffect(() => {
    // Only redirect on initial mount, not when state changes after successful verify
    if (verified.current) return
    if (!mfaRequired || !challengeToken) {
      router.replace("/login")
      return
    }
    inputRef.current?.focus()
  }, [mfaRequired, challengeToken, router])

  // Apply tenant branding pre-auth
  useEffect(() => {
    if (!getTenantSlug()) return
    api.get("/tenant/info")
      .then((res) => applyPrimaryColor(res.data.primary_color))
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== 6) return

    setIsLoading(true)
    try {
      // Send the challenge token as auth — verify endpoint requires it
      const response = await api.post(
        "/auth/verify-mfa",
        { code },
        { headers: { Authorization: `Bearer ${challengeToken}` } }
      )

      verified.current = true
      setAuth(
        response.data.token,
        response.data.user,
        response.data.context,
        response.data.tenant ?? null
      )
      toast.success("Welcome back")
      router.push("/dashboard")
    } catch (err) {
      toast.error(getErrorMessage(err, "Invalid code"))
      setCode("")
      inputRef.current?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const cancel = () => {
    clearAuth()
    router.replace("/login")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Two-step verification</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Verification code</CardTitle>
            <CardDescription>
              Open Google Authenticator or Microsoft Authenticator and enter the current code
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              method="post"
              action="javascript:void(0)"
              onSubmit={handleSubmit}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  ref={inputRef}
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="text-center font-mono text-2xl tracking-[0.5em]"
                  disabled={isLoading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading || code.length !== 6}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <button
          type="button"
          onClick={cancel}
          className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </button>
      </div>
    </div>
  )
}
