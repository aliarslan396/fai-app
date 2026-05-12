"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { ArrowLeft, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { getTenantSlug } from "@/lib/tenant"
import { applyPrimaryColor } from "@/lib/color"

const requestSchema = z.object({
  email: z.string().email("Invalid email address"),
})

const resetSchema = z
  .object({
    email: z.string().email(),
    code: z.string().regex(/^\d{6}$/, "6-digit code required"),
    password: z.string().min(8, "At least 8 characters"),
    password_confirmation: z.string(),
  })
  .refine((d) => d.password === d.password_confirmation, {
    message: "Passwords don't match",
    path: ["password_confirmation"],
  })

type RequestForm = z.infer<typeof requestSchema>
type ResetForm = z.infer<typeof resetSchema>

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<"request" | "reset">("request")
  const [emailSent, setEmailSent] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isTenant, setIsTenant] = useState(false)

  useEffect(() => {
    const slug = getTenantSlug()
    setIsTenant(slug !== null)
    if (slug) {
      api.get("/tenant/info")
        .then((res) => applyPrimaryColor(res.data.primary_color))
        .catch(() => {})
    }
    return () => applyPrimaryColor(null)
  }, [])

  const requestForm = useForm<RequestForm>({ resolver: zodResolver(requestSchema) })
  const resetForm = useForm<ResetForm>({ resolver: zodResolver(resetSchema) })

  const onRequest = async (data: RequestForm) => {
    if (!isTenant) {
      toast.error("Master password reset is handled separately. Contact your administrator.")
      return
    }

    setIsLoading(true)
    try {
      await api.post("/auth/forgot-password", data)
      setEmailSent(data.email)
      resetForm.setValue("email", data.email)
      setStep("reset")
      toast.success("If that email is registered, a code has been sent.")
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to send code"))
    } finally {
      setIsLoading(false)
    }
  }

  const onReset = async (data: ResetForm) => {
    setIsLoading(true)
    try {
      await api.post("/auth/reset-password", data)
      toast.success("Password reset — sign in with your new password")
      router.push("/login")
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to reset password"))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {step === "request" ? <Mail className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {step === "request" ? "Reset your password" : "Enter reset code"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === "request"
              ? "We'll send you a 6-digit code"
              : `Code sent to ${emailSent}`}
          </p>
        </div>

        {!isTenant && (
          <Card className="border-amber-300 bg-amber-50/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="text-sm text-amber-900">
                  Password reset is only available for tenant workspaces. Master administrators
                  must use their workspace login URL.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          {step === "request" ? (
            <>
              <CardHeader>
                <CardTitle>Forgot password</CardTitle>
                <CardDescription>
                  Enter your account email to receive a reset code
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  method="post"
                  action="javascript:void(0)"
                  onSubmit={requestForm.handleSubmit(onRequest)}
                  className="space-y-4"
                  noValidate
                >
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      autoComplete="email"
                      disabled={isLoading}
                      {...requestForm.register("email")}
                    />
                    {requestForm.formState.errors.email && (
                      <p className="text-sm text-destructive">
                        {requestForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading || !isTenant}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send reset code"
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Set a new password</CardTitle>
                <CardDescription>
                  Enter the 6-digit code from your email and choose a new password
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  method="post"
                  action="javascript:void(0)"
                  onSubmit={resetForm.handleSubmit(onReset)}
                  className="space-y-4"
                  noValidate
                >
                  <input type="hidden" {...resetForm.register("email")} />

                  <div className="space-y-2">
                    <Label htmlFor="code">Reset code</Label>
                    <Input
                      id="code"
                      placeholder="000000"
                      inputMode="numeric"
                      maxLength={6}
                      className="font-mono text-lg tracking-widest"
                      disabled={isLoading}
                      {...resetForm.register("code")}
                    />
                    {resetForm.formState.errors.code && (
                      <p className="text-sm text-destructive">
                        {resetForm.formState.errors.code.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">New password</Label>
                    <PasswordInput
                      id="password"
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      disabled={isLoading}
                      {...resetForm.register("password")}
                    />
                    {resetForm.formState.errors.password && (
                      <p className="text-sm text-destructive">
                        {resetForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password_confirmation">Confirm password</Label>
                    <PasswordInput
                      id="password_confirmation"
                      autoComplete="new-password"
                      disabled={isLoading}
                      {...resetForm.register("password_confirmation")}
                    />
                    {resetForm.formState.errors.password_confirmation && (
                      <p className="text-sm text-destructive">
                        {resetForm.formState.errors.password_confirmation.message}
                      </p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      "Reset password"
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => setStep("request")}
                    className="block w-full text-center text-sm text-muted-foreground hover:text-primary"
                  >
                    Didn't receive a code? Try again
                  </button>
                </form>
              </CardContent>
            </>
          )}
        </Card>

        <button
          type="button"
          onClick={() => router.push("/login")}
          className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </button>
      </div>
    </div>
  )
}
