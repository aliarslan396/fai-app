"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertCircle, Loader2, Lock, RotateCcw, Save, ShieldCheck } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"

interface RoleRow {
  id: number
  name: string
  immutable: boolean
  permission_names: string[]
}

interface Payload {
  roles: RoleRow[]
  permissions: string[]
  grouped: Record<string, string[]>
}

/**
 * Roles + Permissions matrix (doc §3 / Timothy Aug 26 request).
 *
 * Admin toggles per-role permissions in-app instead of touching the
 * seeder + redeploying. The `admin` role is rendered as read-only
 * (has every permission, never editable — matches the backend guard).
 * Changes are staged locally until the user clicks Save on that row
 * so accidental clicks can't silently persist.
 */
export default function AdminRolesPage() {
  const { hasPermission } = useAuthStore()
  const canEdit = hasPermission("users.edit")

  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Staged edits per role: role.id -> Set<permission_name>
  const [staged, setStaged] = useState<Record<number, Set<string>>>({})
  const [savingRoleId, setSavingRoleId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<Payload>("/admin/roles")
      setPayload(data)
      // Seed staged state from server-truth so the dirty check works
      const next: Record<number, Set<string>> = {}
      for (const r of data.roles) next[r.id] = new Set(r.permission_names)
      setStaged(next)
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load roles"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const isDirty = useCallback(
    (role: RoleRow): boolean => {
      const s = staged[role.id]
      if (!s) return false
      if (s.size !== role.permission_names.length) return true
      for (const p of role.permission_names) if (!s.has(p)) return true
      return false
    },
    [staged],
  )

  function togglePermission(role: RoleRow, permission: string, checked: boolean) {
    if (role.immutable || !canEdit) return
    setStaged((prev) => {
      const next = { ...prev }
      const set = new Set(next[role.id] ?? [])
      if (checked) set.add(permission)
      else set.delete(permission)
      next[role.id] = set
      return next
    })
  }

  function resetRole(role: RoleRow) {
    setStaged((prev) => ({ ...prev, [role.id]: new Set(role.permission_names) }))
  }

  async function saveRole(role: RoleRow) {
    if (role.immutable) return
    const permission_names = Array.from(staged[role.id] ?? new Set())
    setSavingRoleId(role.id)
    try {
      await api.patch(`/admin/roles/${role.id}/permissions`, { permission_names })
      toast.success(`${role.name.replace(/_/g, " ")} — permissions updated`)
      await load()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save"))
    } finally {
      setSavingRoleId(null)
    }
  }

  const resourceOrder = useMemo(() => {
    if (!payload) return [] as string[]
    return Object.keys(payload.grouped).sort()
  }, [payload])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        {error ?? "Failed to load."}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-slate-600" />
          Roles &amp; Permissions
        </h1>
        <p className="text-sm text-muted-foreground">
          Fine-tune what each role can do. Changes are staged per row — click <strong>Save</strong> to apply.
          The <strong>admin</strong> role is locked with every permission.
        </p>
      </div>

      {!canEdit && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex items-center gap-3 py-3 text-sm text-amber-900">
            <AlertCircle className="h-4 w-4" />
            View-only — you need the <span className="font-mono">users.edit</span> permission to change role permissions.
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {payload.roles.map((role) => {
          const dirty = isDirty(role)
          const isSaving = savingRoleId === role.id
          return (
            <Card key={role.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base capitalize">
                      {role.name.replace(/_/g, " ")}
                      {role.immutable && (
                        <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
                          <Lock className="mr-1 h-3 w-3" /> Locked
                        </Badge>
                      )}
                      {dirty && !role.immutable && (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                          unsaved changes
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {staged[role.id]?.size ?? role.permission_names.length} of {payload.permissions.length} permissions
                    </CardDescription>
                  </div>
                  {!role.immutable && canEdit && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => resetRole(role)} disabled={!dirty || isSaving}>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Reset
                      </Button>
                      <Button size="sm" onClick={() => saveRole(role)} disabled={!dirty || isSaving}>
                        {isSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {resourceOrder.map((resource) => {
                    const perms = payload.grouped[resource]
                    return (
                      <div key={resource} className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {resource}
                        </div>
                        <div className="space-y-1.5">
                          {perms.map((p) => {
                            const checked = role.immutable ? true : staged[role.id]?.has(p) ?? false
                            const label = p.substring(resource.length + 1) || p
                            return (
                              <label
                                key={p}
                                className={`flex items-center gap-2 text-sm ${
                                  role.immutable || !canEdit ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                                }`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => togglePermission(role, p, Boolean(v))}
                                  disabled={role.immutable || !canEdit}
                                />
                                <span className="font-mono text-xs">{label}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
