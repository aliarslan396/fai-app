"use client"

import { KeyRound, ShieldCheck } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChangePasswordForm } from "@/components/change-password-form"
import { useAuthStore } from "@/lib/auth-store"

/**
 * Master console settings.
 *
 * Change-password is here rather than on the tenant profile page
 * because the master admin has no tenant context — and until now there
 * was no way to change this password at all, so the platform's root
 * account kept whatever the seeder gave it.
 */
export default function MasterSettingsPage() {
  const { user, passwordPolicy } = useAuthStore()

  // The API is the source of truth, but render something sensible if the
  // policy has not arrived yet rather than an empty card.
  const requirements = passwordPolicy?.requirements?.length
    ? passwordPolicy.requirements
    : [
        `At least ${passwordPolicy?.min_length ?? 12} characters`,
        "Upper and lower case letters",
        "At least one number",
        "At least one symbol",
        "Not a common or easily guessed password",
        "Not one of your recent passwords",
      ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform Settings</h1>
        <p className="text-sm text-muted-foreground">System-wide configuration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Change password
          </CardTitle>
          <CardDescription>
            This account can provision, suspend and permanently delete any tenant. Changing the
            password signs out every other session; this one stays active.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Password policy
          </CardTitle>
          <CardDescription>
            Applies to every account on the platform, tenant and master alike. Configured
            server-side.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {requirements.map((requirement) => (
              <li key={requirement} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                {requirement}
              </li>
            ))}
          </ul>
          {user?.password_expired && (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This password is past its rotation window and must be changed.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
