"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, UserPlus } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import api from "@/lib/api"
import { getErrorMessage, getValidationErrors } from "@/lib/errors"

const ROLES = [
  { value: "admin", label: "Admin", desc: "Full access including user management" },
  { value: "qa_manager", label: "QA Manager", desc: "All operations except user management" },
  { value: "qa_inspector", label: "QA Inspector", desc: "Create + edit inspections" },
  { value: "shop_floor", label: "Shop Floor", desc: "Edit only" },
  { value: "viewer", label: "Viewer", desc: "Read-only access" },
]

const schema = z.object({
  name: z.string().min(2, "At least 2 characters").max(100),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  password: z.string().min(8, "At least 8 characters"),
  role: z.string().min(1, "Pick a role"),
  cert_number: z.string().max(50).optional(),
  signature_role_title: z.string().max(100).optional(),
})

type Form = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function InviteUserDialog({ open, onOpenChange, onSuccess }: Props) {
  const [busy, setBusy] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { role: "qa_inspector" },
  })

  const role = watch("role")

  useEffect(() => {
    if (!open) reset({ role: "qa_inspector" })
  }, [open, reset])

  const onSubmit = async (data: Form) => {
    setBusy(true)
    try {
      await api.post("/users", data)
      toast.success(`${data.name} invited`)
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      const errors = getValidationErrors(err)
      if (errors.length > 0) {
        errors.forEach((m) => toast.error(m))
      } else {
        toast.error(getErrorMessage(err, "Failed to invite"))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite team member
          </DialogTitle>
          <DialogDescription>
            Add a new user to your workspace. They'll receive their login credentials.
          </DialogDescription>
        </DialogHeader>

        <form
          method="post"
          action="javascript:void(0)"
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" placeholder="John Smith" disabled={busy} {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@company.com"
              autoComplete="off"
              disabled={busy}
              {...register("email")}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input id="phone" placeholder="+1 555 123 4567" disabled={busy} {...register("phone")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cert_number">Cert # (optional)</Label>
              <Input
                id="cert_number"
                placeholder="INS-1042"
                disabled={busy}
                maxLength={50}
                {...register("cert_number")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signature_role_title">Stamp title (optional)</Label>
              <Input
                id="signature_role_title"
                placeholder="Senior QA Inspector"
                disabled={busy}
                maxLength={100}
                {...register("signature_role_title")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v) => setValue("role", v, { shouldValidate: true })}>
              <SelectTrigger id="role" disabled={busy} className="!h-auto w-full py-2.5 [&>span]:line-clamp-none [&>span]:flex-1 [&>span]:text-left">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="py-2.5">
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="font-medium">{r.label}</span>
                      <span className="text-xs text-muted-foreground">{r.desc}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role && <p className="text-sm text-destructive">{errors.role.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Temporary Password</Label>
            <PasswordInput
              id="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              disabled={busy}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              User can change this after first login.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create user
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
