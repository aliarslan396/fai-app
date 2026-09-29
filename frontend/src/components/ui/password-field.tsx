"use client"

import * as React from "react"
import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { PasswordInput } from "@/components/ui/password-input"
import { useAuthStore } from "@/lib/auth-store"
import { assessPassword } from "@/lib/password-strength"

/**
 * Password input with a live requirements checklist and strength meter.
 *
 * Replaces the bare input on every screen that sets a password. Before
 * this, the only feedback was a toast in the corner after submission —
 * so people discovered the rules one rejection at a time.
 *
 * Requirements come from the policy the API reports, not a hardcoded
 * list, so changing PASSWORD_MIN_LENGTH on the server updates the UI
 * with no frontend change.
 */
export interface PasswordFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: string
  onChange: (value: string) => void
  /**
   * Show the checklist. Off for a login form, where listing the rules
   * would be noise — and a hint to anyone guessing.
   */
  showRequirements?: boolean
  /** Extra terms the password must not contain — company, user name. */
  contextTerms?: string[]
  /** Reports whether every client-side rule passes, for submit gating. */
  onValidityChange?: (valid: boolean) => void
}

const METER_COLOURS = [
  "bg-destructive",
  "bg-destructive",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-emerald-600",
]

/**
 * The meter and checklist on their own, for forms that already manage
 * their own input — react-hook-form ones spread `register()` onto the
 * element, so they keep their existing PasswordInput and drop this
 * underneath rather than being rewired to a controlled component.
 */
export function PasswordRequirements({
  value,
  contextTerms,
  className,
}: {
  value: string
  contextTerms?: string[]
  className?: string
}) {
  const { passwordPolicy, tenant, user } = useAuthStore()

  const terms = React.useMemo(() => {
    if (contextTerms) return contextTerms
    return [tenant?.name, user?.name, user?.email].filter(Boolean) as string[]
  }, [contextTerms, tenant?.name, user?.name, user?.email])

  const assessment = React.useMemo(
    () => assessPassword(value, passwordPolicy, terms),
    [value, passwordPolicy, terms],
  )

  if (!value) return null

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <div className="flex h-1.5 flex-1 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "h-full flex-1 rounded-full transition-colors",
                i < assessment.score ? METER_COLOURS[assessment.score] : "bg-muted",
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            "w-16 shrink-0 text-right text-xs font-medium",
            assessment.score >= 3
              ? "text-emerald-600"
              : assessment.score === 2
                ? "text-amber-600"
                : "text-destructive",
          )}
        >
          {assessment.label}
        </span>
      </div>

      <ul className="space-y-1">
        {assessment.checks.map((check) => (
          <li
            key={check.label}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-colors",
              check.met ? "text-emerald-600" : "text-muted-foreground",
            )}
          >
            {check.met ? (
              <Check className="h-3 w-3 shrink-0" />
            ) : (
              <X className="h-3 w-3 shrink-0 opacity-40" />
            )}
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PasswordField({
  value,
  onChange,
  showRequirements = true,
  contextTerms,
  onValidityChange,
  className,
  ...props
}: PasswordFieldProps) {
  const { passwordPolicy, tenant, user } = useAuthStore()

  // Default the context terms to the current tenant and user, since
  // that is what the server checks against.
  const terms = React.useMemo(() => {
    if (contextTerms) return contextTerms
    return [tenant?.name, user?.name, user?.email].filter(Boolean) as string[]
  }, [contextTerms, tenant?.name, user?.name, user?.email])

  const assessment = React.useMemo(
    () => assessPassword(value, passwordPolicy, terms),
    [value, passwordPolicy, terms],
  )

  React.useEffect(() => {
    onValidityChange?.(assessment.allMet)
  }, [assessment.allMet, onValidityChange])

  const touched = value.length > 0

  return (
    <div className="space-y-2">
      <PasswordInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        {...props}
      />

      {showRequirements && touched && (
        <PasswordRequirements value={value} contextTerms={terms} />
      )}
    </div>
  )
}
