"use client"

import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

/**
 * Calendar surface shared by every date field in the app.
 *
 * Class keys follow react-day-picker v10's UI enum. Selection colours are
 * driven by the tenant's --primary CSS variable so the calendar picks up
 * per-tenant branding automatically.
 *
 * Two layout details that are easy to get wrong:
 *
 *  - Nav renders as a sibling of Month inside Months, so `months` is the
 *    positioning context and the nav bar is absolutely placed across the
 *    top of it. The caption sits underneath at the same height, which
 *    keeps the month label optically centred between the arrows.
 *
 *  - In dropdown mode each dropdown is a <select> plus an aria-hidden
 *    <span> carrying the caption label. Both are visible by default,
 *    which renders the month and year twice. The select is therefore
 *    laid over the label at zero opacity: it stays keyboard- and
 *    pointer-accessible while the styled span is what you actually see.
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "space-y-3",

        nav: "absolute inset-x-0 top-0 z-10 flex h-9 items-center justify-between",
        button_previous: cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md",
          "border border-transparent text-muted-foreground transition-colors",
          "hover:border-border hover:bg-accent hover:text-foreground",
          "disabled:pointer-events-none disabled:opacity-30",
        ),
        button_next: cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md",
          "border border-transparent text-muted-foreground transition-colors",
          "hover:border-border hover:bg-accent hover:text-foreground",
          "disabled:pointer-events-none disabled:opacity-30",
        ),

        month_caption: "flex h-9 items-center justify-center px-9",
        dropdowns: "flex items-center gap-1",
        dropdown_root: cn(
          "relative inline-flex items-center rounded-md border border-transparent",
          "px-1.5 py-0.5 transition-colors hover:border-border hover:bg-accent",
          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        ),
        // Overlaid on the styled label — invisible but still the real control.
        dropdown: "absolute inset-0 h-full w-full cursor-pointer opacity-0",
        caption_label: "flex select-none items-center gap-1 text-sm font-semibold tracking-tight",

        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground",
        weeks: "",
        week: "mt-1 flex w-full",

        day: cn(
          "relative h-9 w-9 p-0 text-center text-sm",
          // Range fill sits behind the button so the bar reads as continuous.
          "[&:has([aria-selected])]:bg-primary/10",
          "[&:has(>.day-range-start)]:rounded-l-md [&:has(>.day-range-end)]:rounded-r-md",
          "first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
        ),
        day_button: cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md p-0 text-sm font-normal",
          "transition-colors hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "aria-selected:font-medium",
        ),

        selected: cn(
          "[&>button]:bg-primary [&>button]:text-primary-foreground",
          "[&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground",
        ),
        range_start: "day-range-start [&>button]:bg-primary [&>button]:text-primary-foreground",
        range_end: "day-range-end [&>button]:bg-primary [&>button]:text-primary-foreground",
        range_middle: "[&>button]:bg-transparent [&>button]:text-foreground",

        today: "[&>button]:border [&>button]:border-primary/40 [&>button]:font-semibold",
        outside: "text-muted-foreground/40",
        disabled: "text-muted-foreground/30 line-through",
        hidden: "invisible",

        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass, ...rest }) => {
          const Icon =
            orientation === "left"
              ? ChevronLeft
              : orientation === "right"
                ? ChevronRight
                : orientation === "up"
                  ? ChevronUp
                  : ChevronDown
          return (
            <Icon
              className={cn(
                orientation === "down" || orientation === "up"
                  ? "h-3.5 w-3.5 opacity-60"
                  : "h-4 w-4",
                chevronClass,
              )}
              {...rest}
            />
          )
        },
      }}
      {...props}
    />
  )
}

export { Calendar }
