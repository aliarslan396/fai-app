"use client"

import { ShieldAlert } from "lucide-react"

import { useAuthStore } from "@/lib/auth-store"
import { ChangePasswordForm } from "@/components/change-password-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Full-screen block for accounts past their rotation window.
 *
 * The API returns 403 PASSWORD_EXPIRED on every route except
 * change-password, logout and /me. Without this the user would see
 * every page fail with a generic error and no way to recover — turning
 * on rotation would effectively brick privileged accounts.
 *
 * Deliberately not dismissable: the only way out is to set a new
 * password, which is the point.
 */
export function PasswordExpiredGate() {
  const { user } = useAuthStore()

  if (!user?.password_expired) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <CardTitle>Your password has expired</CardTitle>
          <CardDescription>
            Accounts with elevated permissions rotate their password periodically. Set a new one to
            continue — you will not be signed out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
