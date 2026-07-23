import { Wrench } from "lucide-react"

import { ComingSoon } from "@/components/coming-soon"

export default function GaugesPage() {
  return (
    <ComingSoon
      icon={<Wrench className="h-6 w-6" />}
      title="Gauge Calibration — Coming Soon"
      description="Central register for every measurement gauge on the shop floor. Track serial numbers, calibration history, next-due dates, cert PDF uploads, and expiring alerts on the dashboard. Every gauge you use in an inspection will be selectable from a dropdown instead of free-text tooling entry."
      timeline="Available on production within the next week"
    />
  )
}
