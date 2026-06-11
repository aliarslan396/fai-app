"use client"

import Link from "next/link"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

interface Props {
  currentStep: number
  completedSteps: number[]
  sessionId?: number
}

const STEPS = [
  { num: 1, label: "Part" },
  { num: 2, label: "Plan" },
  { num: 3, label: "Start" },
  { num: 4, label: "Actuals" },
  { num: 5, label: "Sign" },
  { num: 6, label: "Export" },
]

export function WorkflowProgress({ currentStep, completedSteps, sessionId }: Props) {
  const isComplete = (n: number) => completedSteps.includes(n)
  const isCurrent = (n: number) => n === currentStep
  const isUpcoming = (n: number) => !isComplete(n) && !isCurrent(n)

  const stepHref = (n: number): string | null => {
    if (!sessionId) return null
    if (n === 1 || n === 2) return "/workflow/start"
    if (n === 3) return `/workflow/new-inspection/${sessionId}`
    if (n === 4) return `/inspections/${sessionId}/form3`
    return null // Steps 5-6 land in Module 4.6
  }

  return (
    <ol className="flex w-full items-center gap-1">
      {STEPS.map((s, i) => {
        const href = isComplete(s.num) || isCurrent(s.num) ? stepHref(s.num) : null
        const dot = (
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
              isComplete(s.num)
                ? "bg-emerald-600 text-white"
                : isCurrent(s.num)
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {isComplete(s.num) ? <Check className="h-3.5 w-3.5" /> : s.num}
          </div>
        )

        const label = (
          <span
            className={cn(
              "text-xs",
              isComplete(s.num)
                ? "font-medium text-foreground"
                : isCurrent(s.num)
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground"
            )}
          >
            {s.label}
          </span>
        )

        return (
          <li key={s.num} className="flex flex-1 items-center gap-2">
            {href ? (
              <Link href={href} className="flex items-center gap-2 hover:opacity-80">
                {dot}
                {label}
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                {dot}
                {label}
              </div>
            )}
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1",
                  isComplete(s.num) ? "bg-emerald-600/40" : "bg-border"
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
