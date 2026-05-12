"use client"

import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Building2, ImagePlus, Loader2, Palette, Save, Trash2, Upload } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { useAuthStore } from "@/lib/auth-store"
import { resolveAssetUrl } from "@/lib/tenant"

const settingsSchema = z.object({
  name: z.string().min(2, "At least 2 characters").max(100),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use hex format like #1F4E79"),
})

type SettingsForm = z.infer<typeof settingsSchema>

interface TenantSettings {
  id: string
  name: string
  slug: string
  subdomain: string
  logo_url: string | null
  primary_color: string
  status: string
  user_limit: number
  trial_ends_at: string | null
}

const COLOR_PRESETS = [
  "#1F4E79", "#0F766E", "#7C3AED", "#DC2626",
  "#EA580C", "#16A34A", "#0284C7", "#0F172A",
]

export default function TenantSettingsPage() {
  const [settings, setSettings] = useState<TenantSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { hasPermission, context, fetchMe } = useAuthStore()

  const canEdit = context === "tenant" && hasPermission("tenant.settings")

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
  })

  const primaryColor = watch("primary_color")

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const { data } = await api.get("/settings")
      setSettings(data.tenant)
      setValue("name", data.tenant.name)
      setValue("primary_color", data.tenant.primary_color)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load settings"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canEdit) fetchSettings()
    else setLoading(false)
  }, [canEdit])

  const onSubmit = async (data: SettingsForm) => {
    setSaving(true)
    try {
      const { data: response } = await api.patch("/settings", data)
      setSettings((prev) => (prev ? { ...prev, ...response.tenant } : prev))
      await fetchMe() // refresh tenant in auth-store so branding updates live
      toast.success("Settings saved")
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save"))
    } finally {
      setSaving(false)
    }
  }

  const onLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("logo", file)
      const { data } = await api.post("/settings/logo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      setSettings((prev) => (prev ? { ...prev, logo_url: data.logo_url } : prev))
      await fetchMe()
      toast.success("Logo uploaded")
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to upload"))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const onLogoRemove = async () => {
    try {
      await api.delete("/settings/logo")
      setSettings((prev) => (prev ? { ...prev, logo_url: null } : prev))
      await fetchMe()
      toast.success("Logo removed")
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove"))
    }
  }

  const logoSrc = resolveAssetUrl(settings?.logo_url)

  if (!canEdit) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Workspace preferences and configuration</p>
        </div>
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Only tenant admins can access settings.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workspace Settings</h1>
        <p className="text-sm text-muted-foreground">
          Customize your company's branding and information
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Company Details
            </CardTitle>
            <CardDescription>Update your company name and brand color</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="name">Company Name</Label>
                  <Input id="name" disabled={saving} {...register("name")} />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="primary_color" className="flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Primary Color
                  </Label>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <input
                        type="color"
                        value={primaryColor || "#1F4E79"}
                        onChange={(e) => setValue("primary_color", e.target.value, { shouldValidate: true })}
                        className="h-10 w-14 cursor-pointer rounded-md border bg-transparent"
                      />
                    </div>
                    <Input
                      id="primary_color"
                      placeholder="#1F4E79"
                      className="font-mono"
                      disabled={saving}
                      {...register("primary_color")}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setValue("primary_color", c, { shouldValidate: true })}
                        className="h-7 w-7 rounded-md border-2 border-transparent transition hover:scale-110 hover:border-foreground/20"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                  {errors.primary_color && (
                    <p className="text-sm text-destructive">{errors.primary_color.message}</p>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save changes
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImagePlus className="h-5 w-5" />
              Company Logo
            </CardTitle>
            <CardDescription>PNG, JPG, SVG, or WebP up to 2 MB</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed bg-muted/30">
              {loading ? (
                <Skeleton className="h-full w-full rounded-lg" />
              ) : logoSrc ? (
                <img
                  src={logoSrc}
                  alt="Tenant logo"
                  className="max-h-full max-w-full object-contain p-4"
                />
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  <ImagePlus className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No logo uploaded
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={onLogoUpload}
              className="hidden"
            />

            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {settings?.logo_url ? "Replace logo" : "Upload logo"}
                  </>
                )}
              </Button>
              {settings?.logo_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onLogoRemove}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspace Info</CardTitle>
          <CardDescription>Read-only details about your workspace</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <ReadField label="Workspace ID" value={settings?.id || ""} mono />
              <ReadField
                label="Subdomain"
                value={`${settings?.subdomain}.localhost`}
                mono
              />
              <ReadField
                label="Status"
                value={
                  <Badge variant="outline" className="capitalize">
                    {settings?.status}
                  </Badge>
                }
              />
              <ReadField label="User limit" value={settings?.user_limit?.toString() || ""} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ReadField({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  )
}
