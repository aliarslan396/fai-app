"use client"

import { useEffect, useState } from "react"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MfaSection } from "@/components/mfa-section"
import { useAuthStore } from "@/lib/auth-store"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

export default function ProfilePage() {
  const { user, tenant, context, fetchMe } = useAuthStore()
  const [certNumber, setCertNumber] = useState("")
  const [roleTitle, setRoleTitle] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCertNumber(user?.cert_number ?? "")
    setRoleTitle(user?.signature_role_title ?? "")
  }, [user?.cert_number, user?.signature_role_title])

  const isMaster = context === "master"
  const initials =
    user?.name
      ?.split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"

  const handleSaveCredentials = async () => {
    setSaving(true)
    try {
      await api.patch("/auth/me", {
        cert_number: certNumber.trim() || null,
        signature_role_title: roleTitle.trim() || null,
      })
      await fetchMe()
      toast.success("Signature credentials updated")
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

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
            <CardTitle>Signature Credentials</CardTitle>
            <CardDescription>
              These appear on your QA stamp when you sign an inspection form. Leave blank
              to fall back to your role name.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cert_number">Certification number</Label>
                <Input
                  id="cert_number"
                  value={certNumber}
                  onChange={(e) => setCertNumber(e.target.value)}
                  placeholder="e.g. INS-1042"
                  maxLength={50}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role_title">Signature role title</Label>
                <Input
                  id="role_title"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="e.g. Senior QA Inspector"
                  maxLength={100}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveCredentials} disabled={saving} size="sm">
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save credentials
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
