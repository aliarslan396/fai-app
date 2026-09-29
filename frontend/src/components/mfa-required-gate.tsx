"use client"

import { ShieldAlert } from "lucide-react"

import { useAuthStore } from "@/lib/auth-store"
import { MfaSection } from "@/components/mfa-section"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Blocks privileged roles that have not enrolled in TOTP.
 *
 * The API returns 403 MFA_REQUIRED on every route except the MFA setup
 * endpoints, logout and /me. Without this the user would watch every
 * page fail with no explanation and no route to fixing it.
 *
 * Not dismissable — enrolling is the only way past, which is the point.
 * MfaSection is reused rather than duplicated, so the enrolment flow
 * here is the same one on the profile page.
 */
export function MfaRequiredGate() {
  const { user } = useAuthStore()

  // password_expired takes precedence: if both apply, rotating the
  // password first avoids enrolling MFA against a credential that is
  // about to change anyway.
  if (!user?.mfa_required || user?.password_expired) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <CardTitle>Two-factor authentication required</CardTitle>
          <CardDescription>
            Your role can sign off inspections and change what other roles may do, so it requires a
            second factor. Set it up to continue — you will not be signed out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MfaSection />
        </CardContent>
      </Card>
    </div>
  )
}
