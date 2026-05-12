"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function MasterBillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">Subscription revenue across all tenants</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Stripe integration</CardTitle>
          <CardDescription>Coming in Layer 2 / Phase 5</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Billing UI — Phase 5
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
