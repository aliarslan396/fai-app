"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MfaSection } from "@/components/mfa-section"
import { useAuthStore } from "@/lib/auth-store"

export default function ProfilePage() {
  const { user, tenant, context } = useAuthStore()

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U"

  const isMaster = context === "master"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your account details and security settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="text-lg font-medium">{user?.name}</div>
              <div className="text-sm text-muted-foreground">{user?.email}</div>
              <div className="flex gap-2 pt-1">
                {isMaster ? (
                  <Badge variant="secondary" className="capitalize">
                    Super Admin
                  </Badge>
                ) : (
                  user?.roles?.map((r) => (
                    <Badge key={r.name} variant="secondary" className="capitalize">
                      {r.name.replace("_", " ")}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 pt-4 md:grid-cols-2">
            <Field label="Phone" value={user?.phone || "—"} />
            <Field label="Status" value={user?.status || "—"} />
            <Field label="Workspace" value={tenant?.name || "Master Console"} />
            <Field
              label="MFA"
              value={user?.two_factor_enabled ? "Enabled" : "Disabled"}
            />
          </div>
        </CardContent>
      </Card>

      {!isMaster && (
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Two-factor authentication and password</CardDescription>
          </CardHeader>
          <CardContent>
            <MfaSection />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  )
}
