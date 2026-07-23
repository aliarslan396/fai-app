import { BarChart3 } from "lucide-react"

import { ComingSoon } from "@/components/coming-soon"

export default function ReportsPage() {
  return (
    <ComingSoon
      icon={<BarChart3 className="h-6 w-6" />}
      title="Reports &amp; Analytics — Coming Soon"
      description="KPI dashboard with first-pass yield, top failure characteristics, inspector throughput, NCR trending, and gauge calibration compliance. Chart.js widgets with drill-down. Export any chart to PNG or PDF for review meetings."
      timeline="Available on production within 2 weeks"
    />
  )
}
