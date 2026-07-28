"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import api from "@/lib/api"

/**
 * Routes `/inspections/[id]` to the appropriate sub-page based on
 * the session type (as9102 → /form3, custom → /custom-report).
 *
 * Exists as a defensive route so any deep link that omits the sub-path
 * (e.g. "view inspection" from an NCR detail page) lands somewhere
 * useful instead of a 404.
 */
export default function InspectionRedirectPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    if (!params.id) return
    ;(async () => {
      try {
        const { data } = await api.get(`/workflow/sessions/${params.id}`)
        const type = data?.session?.session_type
        const target = type === "custom" ? "custom-report" : "form3"
        router.replace(`/inspections/${params.id}/${target}`)
      } catch {
        router.replace("/inspections")
      }
    })()
  }, [params.id, router])

  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening inspection…
    </div>
  )
}
