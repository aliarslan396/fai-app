"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuthStore } from "@/lib/auth-store"
import { useHasHydrated } from "@/lib/use-hydration"

export default function Home() {
  const router = useRouter()
  const hasHydrated = useHasHydrated()
  const { isAuthenticated, token, context } = useAuthStore()

  useEffect(() => {
    if (!hasHydrated) return

    if (!isAuthenticated || !token) {
      router.replace("/login")
      return
    }

    if (context === "master") {
      router.replace("/master/tenants")
    } else {
      router.replace("/dashboard")
    }
  }, [isAuthenticated, token, context, hasHydrated, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}
