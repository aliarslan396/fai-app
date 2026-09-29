"use client"

import { useState } from "react"
import { toast } from "sonner"
import { KeyRound, Loader2 } from "lucide-react"

import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { PasswordField } from "@/components/ui/password-field"

/**
 * Change your own password. Shared by the tenant profile page and the
 * master console, which post to different endpoints but enforce the
 * same policy.
 *
 * Every other session is revoked server-side on success; the caller
 * keeps its own token, so this does not bounce you to the login screen.
 */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { context, fetchMe } = useAuthStore()

  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [policyMet, setPolicyMet] = useState(false)
  const [saving, setSaving] = useState(false)

  const endpoint = context === "master" ? "/master/auth/change-password" : "/auth/change-password"

  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit = current.length > 0 && policyMet && next === confirm && confirm.length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post(endpoint, {
        current_password: current,
        password: next,
        password_confirmation: confirm,
      })
      toast.success("Password updated. Other sessions have been signed out.")
      setCurrent("")
      setNext("")
      setConfirm("")
      // Refresh so a cleared password_expired flag takes effect without
      // a reload — otherwise the rotation gate would still be showing.
      await fetchMe()
      onDone?.()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update password"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="current_password">Current password</Label>
        <PasswordInput
          id="current_password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          disabled={saving}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new_password">New password</Label>
        <PasswordField
          id="new_password"
          autoComplete="new-password"
          value={next}
          onChange={setNext}
          onValidityChange={setPolicyMet}
          disabled={saving}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm_password">Confirm new password</Label>
        <PasswordInput
          id="confirm_password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={saving}
        />
        {mismatch && <p className="text-xs text-destructive">Passwords do not match.</p>}
      </div>

      <Button type="submit" disabled={!canSubmit || saving}>
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Updating...
          </>
        ) : (
          <>
            <KeyRound className="mr-2 h-4 w-4" />
            Update password
          </>
        )}
      </Button>
    </form>
  )
}
