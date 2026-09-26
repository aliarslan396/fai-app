"use client"

import * as React from "react"
import { format } from "date-fns"
import type { Matcher } from "react-day-picker"
import { CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * Drop-in replacement for `<Input type="date">`.
 *
 * Keeps the native contract — `value` and `onChange` both speak the
 * `YYYY-MM-DD` string that the API layer already expects — so swapping a
 * native input for this one is a one-line change and no request payload
 * shifts shape.
 *
 * Dates are parsed and formatted from local calendar components rather
 * than `new Date(string)`, which would read the value as UTC midnight and
 * land on the previous day for anyone west of Greenwich.
 */
export interface DatePickerProps {
  value?: string
  onChange: (value: string) => void
  /** Earliest selectable date, `YYYY-MM-DD`. */
  min?: string
  /** Latest selectable date, `YYYY-MM-DD`. */
  max?: string
  placeholder?: string
  disabled?: boolean
  /** Show the inline clear button once a date is set. Default true. */
  clearable?: boolean
  id?: string
  className?: string
  /** Rendered under the field when the current value is outside min/max. */
  "aria-label"?: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function fromISO(value?: string): Date | undefined {
  if (!value || !ISO_DATE.test(value)) return undefined
  const [y, m, d] = value.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a date",
  disabled,
  clearable = true,
  id,
  className,
  ...rest
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const selected = fromISO(value)
  const minDate = fromISO(min)
  const maxDate = fromISO(max)

  const disabledMatcher = React.useMemo<Matcher[] | undefined>(() => {
    const rules: Matcher[] = []
    if (minDate) rules.push({ before: minDate })
    if (maxDate) rules.push({ after: maxDate })
    return rules.length ? rules : undefined
  }, [minDate, maxDate])

  const handleSelect = (date?: Date) => {
    if (!date) return
    onChange(toISO(date))
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onChange("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={rest["aria-label"]}
          className={cn(
            "group w-full justify-start gap-2 px-3 font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          <span className="flex-1 truncate text-left">
            {selected ? format(selected, "MMM d, yyyy") : placeholder}
          </span>
          {clearable && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear date"
              onClick={handleClear}
              className={cn(
                "-mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded",
                "text-muted-foreground opacity-0 transition-opacity",
                "hover:bg-accent hover:text-foreground group-hover:opacity-100",
              )}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected ?? maxDate ?? new Date()}
          disabled={disabledMatcher}
          captionLayout="dropdown"
          startMonth={minDate ?? new Date(new Date().getFullYear() - 10, 0)}
          endMonth={maxDate ?? new Date(new Date().getFullYear() + 10, 11)}
          autoFocus
        />
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => handleSelect(new Date())}
          >
            Today
          </Button>
          {clearable && selected && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
