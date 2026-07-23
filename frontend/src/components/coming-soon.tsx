"use client"

import Link from "next/link"
import { Construction, ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface Props {
  title: string
  description: string
  timeline?: string
  icon?: React.ReactNode
}

/**
 * Placeholder shown for sidebar features whose UI isn't built yet.
 * Backend is often ready before the frontend page — this avoids a
 * "404 Not Found" impression when a tester clicks the sidebar item.
 */
export function ComingSoon({ title, description, timeline, icon }: Props) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-2xl items-center justify-center px-4">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            {icon ?? <Construction className="h-6 w-6" />}
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">
              We&apos;re actively working on this. Feel free to explore the rest of the app.
            </p>
          </div>

          <p className="max-w-md text-sm text-muted-foreground">{description}</p>

          {timeline && (
            <div className="mt-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Estimated:</span> {timeline}
            </div>
          )}

          <div className="pt-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
