import { useCallback, useEffect, useState } from "react"
import api from "./api"

export type NcrSeverity = "minor" | "major" | "critical"

export type NcrDisposition =
  | "pending"
  | "rework"
  | "scrap"
  | "use_as_is"
  | "return_to_vendor"
  | "no_defect_found"

export type NcrStatus = "open" | "dispositioned" | "closed"

export interface NcrUserRef {
  id: number
  name: string
  email?: string
}

export interface NcrPartRef {
  id: number
  part_number: string
  description: string | null
}

export interface Ncr {
  id: number
  ncr_number: string
  part_id: number | null
  inspection_session_id: number | null
  source_type: string | null
  source_id: number | null
  characteristic_ref: string | null
  requirement: string | null
  actual_result: string | null
  unit: string | null
  severity: NcrSeverity
  cause: string | null
  disposition: NcrDisposition
  disposition_notes: string | null
  status: NcrStatus
  closure_notes: string | null
  created_by: number
  dispositioned_by: number | null
  dispositioned_at: string | null
  closed_by: number | null
  closed_at: string | null
  created_at: string
  updated_at: string
  part?: NcrPartRef | null
  creator?: NcrUserRef | null
  dispositioner?: NcrUserRef | null
  closer?: NcrUserRef | null
}

export interface NcrListResponse {
  ncrs: {
    data: Ncr[]
    current_page: number
    last_page: number
    total: number
    per_page: number
  }
}

export const SEVERITY_LABEL: Record<NcrSeverity, string> = {
  minor: "Minor",
  major: "Major",
  critical: "Critical",
}

export const SEVERITY_COLOR: Record<NcrSeverity, string> = {
  minor: "bg-slate-100 text-slate-700 border-slate-300",
  major: "bg-amber-100 text-amber-800 border-amber-300",
  critical: "bg-red-100 text-red-800 border-red-300",
}

export const DISPOSITION_LABEL: Record<NcrDisposition, string> = {
  pending: "Pending Disposition",
  rework: "Rework",
  scrap: "Scrap",
  use_as_is: "Use As-Is",
  return_to_vendor: "Return to Vendor",
  no_defect_found: "No Defect Found",
}

export const STATUS_LABEL: Record<NcrStatus, string> = {
  open: "Open",
  dispositioned: "Dispositioned",
  closed: "Closed",
}

export const STATUS_COLOR: Record<NcrStatus, string> = {
  open: "bg-red-100 text-red-800 border-red-300",
  dispositioned: "bg-amber-100 text-amber-800 border-amber-300",
  closed: "bg-emerald-100 text-emerald-800 border-emerald-300",
}

interface UseNcrsOptions {
  status?: NcrStatus | ""
  disposition?: NcrDisposition | ""
  partId?: number
  sessionId?: number
}

export function useNcrs(options: UseNcrsOptions = {}) {
  const [ncrs, setNcrs] = useState<Ncr[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = {}
      if (options.status) params.status = options.status
      if (options.disposition) params.disposition = options.disposition
      if (options.partId) params.part_id = options.partId
      if (options.sessionId) params.inspection_session_id = options.sessionId

      const { data } = await api.get<NcrListResponse>("/ncrs", { params })
      setNcrs(data.ncrs.data ?? [])
      setTotal(data.ncrs.total ?? 0)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load NCRs")
    } finally {
      setLoading(false)
    }
    // stringify to keep effect stable across renders w/ same values
  }, [JSON.stringify(options)]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { ncrs, loading, error, refetch, total }
}

export function useNcr(id: number | null) {
  const [ncr, setNcr] = useState<Ncr | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<{ ncr: Ncr }>(`/ncrs/${id}`)
      setNcr(data.ncr)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load NCR")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { ncr, loading, error, refetch }
}
