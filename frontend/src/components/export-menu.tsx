"use client"

import { useState } from "react"
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"

type ExportFormat = {
  key: string
  label: string
  icon: React.ReactNode
  path: (id: number) => string
  filename: (id: number, formIdent?: string | null) => string
}

const AS9102_FORMATS: ExportFormat[] = [
  {
    key: "as9102-excel",
    label: "AS9102 Excel (4-tab)",
    icon: <FileSpreadsheet className="mr-2 h-4 w-4" />,
    path: (id) => `/exports/as9102-excel/${id}`,
    filename: (id, ident) => `AS9102-${ident ?? `form-${id}`}.xlsx`,
  },
  {
    key: "as9102-pdf",
    label: "AS9102 PDF",
    icon: <FileText className="mr-2 h-4 w-4" />,
    path: (id) => `/exports/as9102-pdf/${id}`,
    filename: (id, ident) => `AS9102-${ident ?? `form-${id}`}.pdf`,
  },
]

const CUSTOM_REPORT_FORMATS: ExportFormat[] = [
  {
    key: "custom-report-pdf",
    label: "Report PDF",
    icon: <FileText className="mr-2 h-4 w-4" />,
    path: (id) => `/exports/custom-report-pdf/${id}`,
    filename: (id, ident) => `InspectionReport-${ident ?? `report-${id}`}.pdf`,
  },
]

interface Props {
  kind: "as9102" | "custom-report"
  id: number
  identifier?: string | null
  disabled?: boolean
  canExport?: boolean
}

export function ExportMenu({ kind, id, identifier, disabled = false, canExport = true }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const formats = kind === "as9102" ? AS9102_FORMATS : CUSTOM_REPORT_FORMATS

  if (!canExport) return null

  const handleDownload = async (fmt: ExportFormat) => {
    setDownloading(fmt.key)
    try {
      const res = await api.get(fmt.path(id), { responseType: "blob" })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement("a")
      a.href = url
      a.download = fmt.filename(id, identifier ?? null)
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(`${fmt.label} downloaded`)
    } catch (err) {
      toast.error(getErrorMessage(err, `${fmt.label} download failed`))
    } finally {
      setDownloading(null)
    }
  }

  if (formats.length === 1) {
    const fmt = formats[0]
    const active = downloading === fmt.key
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleDownload(fmt)}
        disabled={disabled || active}
      >
        {active ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
        {fmt.label}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || !!downloading}>
          {downloading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1 h-3.5 w-3.5" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((fmt) => (
          <DropdownMenuItem
            key={fmt.key}
            disabled={downloading !== null}
            onSelect={(e) => {
              e.preventDefault()
              void handleDownload(fmt)
            }}
          >
            {fmt.icon}
            {fmt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
