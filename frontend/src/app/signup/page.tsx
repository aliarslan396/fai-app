"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Rocket, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import api from "@/lib/api"
import { getErrorMessage, getValidationErrors } from "@/lib/errors"
import { tenantDisplayHost } from "@/lib/url"

const signupSchema = z.object({
  company_name: z.string().min(2, "Company name required").max(100),
  subdomain: z
    .string()
    .min(2, "At least 2 characters")
    .max(30, "Max 30 characters")
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Lowercase letters, numbers, hyphens only"),
  admin_name: z.string().min(2, "Name required").max(100),
  admin_email: z.string().email("Invalid email"),
  admin_password: z.string().min(8, "At least 8 characters"),
})

type SignupForm = z.infer<typeof signupSchema>

interface SignupResult {
  tenant: { id: string; name: string; subdomain: string; status: string }
  admin_email: string
  login_url: string
}

export default function SignupPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<SignupResult | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
  })

  const subdomain = watch("subdomain")

  const onSubmit = async (data: SignupForm) => {
    setIsLoading(true)
    try {
      const response = await api.post("/signup", data)
      setResult(response.data)
      toast.success("Workspace created successfully")
    } catch (error: unknown) {
      const validationErrors = getValidationErrors(error)
      if (validationErrors.length > 0) {
        validationErrors.forEach((m) => toast.error(m))
      } else {
        toast.error(getErrorMessage(error, "Signup failed"))
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex flex-col items-center space-y-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <CardTitle>Workspace Created</CardTitle>
              <CardDescription>
                {result.tenant.name} is ready
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Company</span>
                <span className="font-medium">{result.tenant.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subdomain</span>
                <span className="font-mono font-medium">{result.tenant.subdomain}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Admin</span>
                <span className="font-medium">{result.admin_email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium capitalize">{result.tenant.status}</span>
              </div>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Your workspace login URL
              </p>
              <p className="font-mono text-sm break-all">
                {result.login_url}
              </p>
            </div>

            <Button
              className="w-full"
              onClick={() => { window.location.href = result.login_url }}
            >
              Go to your workspace
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Rocket className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Create Your Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Set up FAI for your company in under a minute
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Company Details</CardTitle>
            <CardDescription>
              Get a dedicated subdomain and your first admin account
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
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  placeholder="Acme Aerospace"
                  disabled={isLoading}
                  {...register("company_name")}
                />
                {errors.company_name && (
                  <p className="text-sm text-destructive">{errors.company_name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="subdomain">Subdomain</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="subdomain"
                    placeholder="acme"
                    disabled={isLoading}
                    {...register("subdomain")}
                  />
                  <span className="text-sm text-muted-foreground">
                    .{typeof window !== "undefined" && window.location.hostname !== "localhost"
                      ? window.location.hostname.split(".").slice(-2).join(".")
                      : "localhost"}
                  </span>
                </div>
                {subdomain && !errors.subdomain && (
                  <p className="text-xs text-muted-foreground">
                    Your URL: <span className="font-mono">{tenantDisplayHost(subdomain)}</span>
                  </p>
                )}
                {errors.subdomain && (
                  <p className="text-sm text-destructive">{errors.subdomain.message}</p>
                )}
              </div>

              <div className="space-y-2 pt-3 border-t">
                <Label htmlFor="admin_name">Your Name</Label>
                <Input
                  id="admin_name"
                  placeholder="John Smith"
                  disabled={isLoading}
                  {...register("admin_name")}
                />
                {errors.admin_name && (
                  <p className="text-sm text-destructive">{errors.admin_name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin_email">Your Email</Label>
                <Input
                  id="admin_email"
                  type="email"
                  placeholder="you@company.com"
                  disabled={isLoading}
                  {...register("admin_email")}
                />
                {errors.admin_email && (
                  <p className="text-sm text-destructive">{errors.admin_email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin_password">Password</Label>
                <PasswordInput
                  id="admin_password"
                  placeholder="At least 8 characters"
                  disabled={isLoading}
                  {...register("admin_password")}
                />
                {errors.admin_password && (
                  <p className="text-sm text-destructive">{errors.admin_password.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating workspace...
                  </>
                ) : (
                  "Create Workspace"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground">
          Already have a workspace?{" "}
          <a href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </a>
        </div>
      </div>
    </div>
  )
}
