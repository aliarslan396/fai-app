"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Save, KeyRound } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import api from "@/lib/api"
import { getErrorMessage, getValidationErrors } from "@/lib/errors"

interface User {
  id: number
  name: string
  email: string
  phone: string | null
  status: "active" | "disabled" | "pending"
  two_factor_enabled: boolean
  cert_number?: string | null
  signature_role_title?: string | null
  roles: Array<{ name: string }>
}

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "qa_manager", label: "QA Manager" },
  { value: "qa_inspector", label: "QA Inspector" },
  { value: "shop_floor", label: "Shop Floor" },
  { value: "viewer", label: "Viewer" },
]

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional().or(z.literal("")),
  role: z.string().min(1),
  password: z.string().optional().or(z.literal("")),
  cert_number: z.string().max(50).optional().or(z.literal("")),
  signature_role_title: z.string().max(100).optional().or(z.literal("")),
})

type Form = z.infer<typeof schema>

interface Props {
  user: User | null
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function EditUserSheet({ user, onOpenChange, onSuccess }: Props) {
  const [busy, setBusy] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const role = watch("role")

  useEffect(() => {
    if (user) {
      reset({
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        role: user.roles?.[0]?.name || "viewer",
        password: "",
        cert_number: user.cert_number || "",
        signature_role_title: user.signature_role_title || "",
      })
    }
  }, [user, reset])

  const onSubmit = async (data: Form) => {
    if (!user) return
    setBusy(true)
    try {
      const payload: Record<string, string | null> = {
        name: data.name,
        email: data.email,
        phone: data.phone || "",
        role: data.role,
        cert_number: data.cert_number?.trim() || null,
        signature_role_title: data.signature_role_title?.trim() || null,
      }
      if (data.password) payload.password = data.password

      await api.patch(`/users/${user.id}`, payload)
      toast.success("User updated")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      const errors = getValidationErrors(err)
      if (errors.length > 0) {
        errors.forEach((m) => toast.error(m))
      } else {
        toast.error(getErrorMessage(err, "Failed to update"))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={user !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Edit user</SheetTitle>
          <SheetDescription>
            Update details, change role, or reset password.
          </SheetDescription>
        </SheetHeader>

        {user && (
          <form
            method="post"
            action="javascript:void(0)"
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-1 flex-col overflow-y-auto"
            noValidate
          >
            <div className="flex-1 space-y-5 px-6 py-5">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline">ID: {user.id}</Badge>
              <Badge variant={user.status === "active" ? "default" : "secondary"} className="capitalize">
                {user.status}
              </Badge>
              {user.two_factor_enabled && (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-700">
                  MFA on
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_name">Full Name</Label>
              <Input id="edit_name" disabled={busy} {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_email">Email</Label>
              <Input id="edit_email" type="email" disabled={busy} {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_phone">Phone</Label>
              <Input id="edit_phone" disabled={busy} {...register("phone")} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit_cert">Cert #</Label>
                <Input
                  id="edit_cert"
                  placeholder="INS-1042"
                  disabled={busy}
                  maxLength={50}
                  {...register("cert_number")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_stamp_title">Stamp title</Label>
                <Input
                  id="edit_stamp_title"
                  placeholder="Senior QA Inspector"
                  disabled={busy}
                  maxLength={100}
                  {...register("signature_role_title")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_role">Role</Label>
              <Select value={role} onValueChange={(v) => setValue("role", v, { shouldDirty: true })}>
                <SelectTrigger id="edit_role" disabled={busy} className="!h-11 w-full [&>span]:line-clamp-none [&>span]:flex-1 [&>span]:text-left">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="py-2.5">
                      <span className="font-medium">{r.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <Label htmlFor="edit_password" className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Reset password
              </Label>
              <PasswordInput
                id="edit_password"
                placeholder="Leave empty to keep current"
                autoComplete="new-password"
                disabled={busy}
                {...register("password")}
              />
              <p className="text-xs text-muted-foreground">
                Set a new password only if you want to reset it.
              </p>
            </div>
            </div>

            <SheetFooter className="flex-row justify-end gap-2 border-t bg-muted/30 px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !isDirty}>
                {busy ? (
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
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  )
}
