import { AlertTriangle } from "lucide-react"

import { ComingSoon } from "@/components/coming-soon"

export default function NcrPage() {
  return (
    <ComingSoon
      icon={<AlertTriangle className="h-6 w-6" />}
      title="NCR / CAPA — Coming Soon"
      description="Non-Conformance Reports and Corrective / Preventive Actions. Log defects with auto-numbered NCRs, route dispositions (rework / scrap / use-as-is / return-to-vendor), track CAPAs to closure with 30 / 60 / 90 day verification. Backend is live and ready — UI is being built this week."
      timeline="Available on production by end of this week"
    />
  )
}
