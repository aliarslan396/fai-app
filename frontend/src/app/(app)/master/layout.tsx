"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { useAuthStore } from "@/lib/auth-store"

/**
 * Restricts /master/* to master-context sessions.
 *
 * The API already rejects these calls from a tenant token, so nothing
 * leaked — but the pages still rendered, which meant a tenant user who
 * typed the URL got a master console shell inside their own sidebar,
 * with forms that silently 403 on submit. Confusing, and it looks like
 * a broken product rather than a permission boundary.
 */
export default function MasterLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { context, isLoading } = useAuthStore()

  const allowed = context === "master"

  useEffect(() => {
    if (!isLoading && context && !allowed) {
      router.replace("/dashboard")
    }
  }, [allowed, context, isLoading, router])

  if (!allowed) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <>{children}</>
}
