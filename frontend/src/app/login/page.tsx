"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, ShieldCheck, Building2, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import api from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"
import { getTenantSlug } from "@/lib/tenant"
import { getErrorMessage } from "@/lib/errors"
import { applyPrimaryColor } from "@/lib/color"

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password required"),
})

type LoginForm = z.infer<typeof loginSchema>

interface TenantInfo {
  id: string
  name: string
  slug: string
  primary_color: string
  status: string
}

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [tenant, setTenant] = useState<TenantInfo | null>(null)
  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const { setAuth, setMfaChallenge } = useAuthStore()

  const isTenant = tenantSlug !== null

  useEffect(() => {
    const slug = getTenantSlug()
    setTenantSlug(slug)

    if (slug) {
      api.get("/tenant/info")
        .then((res) => {
          setTenant(res.data)
          applyPrimaryColor(res.data.primary_color)
        })
        .catch(() => toast.error("Tenant not found"))
    }

    // Cleanup: reset primary color on unmount (so master login isn't affected)
    return () => applyPrimaryColor(null)
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    try {
      const endpoint = isTenant ? "/auth/login" : "/master/auth/login"
      const response = await api.post(endpoint, data)

      if (response.data.mfa_required) {
        setMfaChallenge(response.data.challenge_token)
        router.push("/mfa")
        return
      }

      setAuth(
        response.data.token,
        response.data.user,
        response.data.context,
        response.data.tenant ?? null
      )
      toast.success("Welcome back")
      router.push(isTenant ? "/dashboard" : "/master/tenants")
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Login failed"))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {isTenant ? <Building2 className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {tenant ? tenant.name : "FAI"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isTenant ? "Quality Management Workspace" : "FAI Platform — Master Console"}
          </p>
          {isTenant && tenant && tenant.status === "active" && (
            <Badge variant="outline" className="capitalize">Active</Badge>
          )}
          {isTenant && tenant && tenant.status === "trial" && (
            <Badge variant="outline" className="capitalize">Trial</Badge>
          )}
        </div>

        {isTenant && tenant && (tenant.status === "suspended" || tenant.status === "cancelled") && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="capitalize">Workspace {tenant.status}</AlertTitle>
            <AlertDescription>
              This workspace has been {tenant.status}. Contact your administrator to restore access.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              {isTenant ? "Sign in to your workspace" : "Master Admin Sign In"}
            </CardTitle>
            <CardDescription>
              {isTenant
                ? `Enter your ${tenant?.name ?? ""} credentials`
                : "Master super admin access only"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              method="post"
              action="javascript:void(0)"
              onSubmit={handleSubmit(onSubmit)}
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
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <a
                    href="/forgot-password"
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    Forgot?
                  </a>
                </div>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  disabled={isLoading}
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={
                  isLoading ||
                  Boolean(isTenant && tenant && (tenant.status === "suspended" || tenant.status === "cancelled"))
                }
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : isTenant && tenant && (tenant.status === "suspended" || tenant.status === "cancelled") ? (
                  "Workspace inactive"
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {!isTenant && (
          <div className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <a href="/signup" className="font-medium text-primary hover:underline">
              Create your workspace
            </a>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Protected by enterprise-grade security with MFA
        </p>
      </div>
    </div>
  )
}
