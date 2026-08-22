"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Loader2, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  STATUS_COLOR,
  STATUS_LABEL,
  apiLookupGauges,
  type GaugeLookupRow,
} from "@/lib/gauges"

interface Props {
  value: string | null
  onChange: (gaugeId: string | null, row: GaugeLookupRow | null) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  /** Show inline status badge next to the selected value */
  showStatus?: boolean
}

/**
 * Type-ahead picker over the gauge master. Used on Form 3 and any
 * other row that needs a gauge reference. Debounces at 200ms, hides
 * out-of-service gauges (backend enforces), and surfaces a live
 * calibration status badge so the inspector sees red before they
 * measure with an expired tool.
 */
export function GaugeAutocomplete({
  value,
  onChange,
  disabled,
  placeholder = "Gauge ID...",
  className,
  showStatus = true,
}: Props) {
  const [query, setQuery] = useState(value ?? "")
  const [rows, setRows] = useState<GaugeLookupRow[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<GaugeLookupRow | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value ?? "")
  }, [value])

  // Resolve the selected value into a full row (for badge display) —
  // one lookup on mount for the current value.
  useEffect(() => {
    if (!value || selected?.gauge_id === value) return
    void (async () => {
      try {
        const res = await apiLookupGauges(value, 5)
        const match = res.data.gauges.find((g) => g.gauge_id === value) ?? null
        setSelected(match)
      } catch {
        /* non-fatal */
      }
    })()
  }, [value, selected?.gauge_id])

  // Click-outside to close
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const search = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setBusy(true)
      try {
        const res = await apiLookupGauges(q, 20)
        setRows(res.data.gauges)
      } catch {
        setRows([])
      } finally {
        setBusy(false)
      }
    }, 200)
  }

  const pick = (row: GaugeLookupRow) => {
    setSelected(row)
    setQuery(row.gauge_id)
    setOpen(false)
    onChange(row.gauge_id, row)
  }

  const clear = () => {
    setSelected(null)
    setQuery("")
    onChange(null, null)
  }

  const statusBadge = selected && showStatus && (
    <Badge variant="outline" className={cn("ml-1 shrink-0 text-[10px]", STATUS_COLOR[selected.status])}>
      {STATUS_LABEL[selected.status]}
      {typeof selected.days_until_due === "number" && selected.status !== "current" && (
        <span className="ml-1">({selected.days_until_due}d)</span>
      )}
    </Badge>
  )

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
              search(e.target.value)
            }}
            onFocus={() => {
              setOpen(true)
              if (!rows.length) search(query)
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="pr-8"
          />
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        {selected && !disabled && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={clear}
            title="Clear"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {statusBadge && <div className="mt-1">{statusBadge}</div>}

      {open && !disabled && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-lg">
          {busy && (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Searching...
            </div>
          )}
          {!busy && rows.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No gauges match &quot;{query}&quot;
            </div>
          )}
          {!busy && rows.length > 0 && (
            <ul className="py-1">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-mono font-medium">{r.gauge_id}</span>
                    <span className="text-xs text-muted-foreground">{r.type}</span>
                    {r.serial_number && (
                      <span className="text-xs text-muted-foreground">· SN {r.serial_number}</span>
                    )}
                    <Badge
                      variant="outline"
                      className={cn("ml-auto shrink-0 text-[10px]", STATUS_COLOR[r.status])}
                    >
                      {STATUS_LABEL[r.status]}
                      {typeof r.days_until_due === "number" && r.status !== "current" && (
                        <span className="ml-1">({r.days_until_due}d)</span>
                      )}
                    </Badge>
                    {selected?.id === r.id && <Check className="h-3 w-3 text-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
