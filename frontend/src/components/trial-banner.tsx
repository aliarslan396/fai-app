"use client"

import { useEffect, useState } from "react"
import { Sparkles, AlertTriangle } from "lucide-react"
import api from "@/lib/api"
import { useAuthStore } from "@/lib/auth-store"

interface TenantInfo {
  status: string
  trial_days_left: number | null
  trial_expired: boolean
}

export function TrialBanner() {
  const { context, hasPermission } = useAuthStore()
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null)

  const canUpgrade = hasPermission("tenant.billing")

  useEffect(() => {
    if (context !== "tenant") return
    api.get("/tenant/info").then((r) => setTenantInfo(r.data)).catch(() => {})
  }, [context])

  if (!tenantInfo || tenantInfo.status !== "trial") return null
  if (tenantInfo.trial_days_left === null) return null

  const days = tenantInfo.trial_days_left
  const isUrgent = days <= 3
  const isCritical = days <= 1

  return (
    <div
      className={`flex items-center justify-between gap-3 border-b px-6 py-2 text-sm ${
        isCritical
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : isUrgent
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-blue-200 bg-blue-50 text-blue-900"
      }`}
    >
      <div className="flex items-center gap-2">
        {isUrgent ? (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        ) : (
          <Sparkles className="h-4 w-4 shrink-0" />
        )}
        <span className="font-medium">
          {days === 0
            ? "Your trial expires today"
            : days === 1
              ? "Your trial expires tomorrow"
              : `${days} days left in your trial`}
        </span>
        <span className="hidden text-current/70 sm:inline">
          {canUpgrade
            ? "· Upgrade to continue using FAI after your trial ends"
            : "· Contact your admin to upgrade before the trial ends"}
        </span>
      </div>
      {canUpgrade && (
        <button
          className="font-medium underline-offset-2 hover:underline"
          onClick={() => alert("Upgrade flow coming in Phase 5")}
        >
          Upgrade
        </button>
      )}
    </div>
  )
}
