import { useCallback, useEffect, useState } from "react"
import api from "./api"

export type CapaStatus =
  | "open"
  | "root_cause_pending"
  | "action_plan_pending"
  | "approved"
  | "in_progress"
  | "closed"
  | "ineffective"

export interface CapaUserRef {
  id: number
  name: string
  email?: string
}

export interface CapaPartRef {
  id: number
  part_number: string
  description: string | null
}

export interface CapaSourceNcrRef {
  id: number
  ncr_number: string
  status?: string
  defect_code?: string | null
  severity?: string
}

export interface Capa {
  id: number
  capa_number: string
  source_ncr_id: number | null
  part_id: number | null
  defect_code: string | null
  problem_statement: string | null
  status: CapaStatus
  created_by: number
  created_at: string
  updated_at: string
  source_ncr?: CapaSourceNcrRef | null
  part?: CapaPartRef | null
  creator?: CapaUserRef | null
}

export const CAPA_STATUS_LABEL: Record<CapaStatus, string> = {
  open: "Open",
  root_cause_pending: "Root Cause Pending",
  action_plan_pending: "Action Plan Pending",
  approved: "Approved",
  in_progress: "In Progress",
  closed: "Closed",
  ineffective: "Ineffective",
}

export const CAPA_STATUS_COLOR: Record<CapaStatus, string> = {
  open: "bg-red-100 text-red-800 border-red-300",
  root_cause_pending: "bg-amber-100 text-amber-800 border-amber-300",
  action_plan_pending: "bg-amber-100 text-amber-800 border-amber-300",
  approved: "bg-blue-100 text-blue-800 border-blue-300",
  in_progress: "bg-blue-100 text-blue-800 border-blue-300",
  closed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  ineffective: "bg-orange-100 text-orange-800 border-orange-300",
}

export function useCapa(id: number | null) {
  const [capa, setCapa] = useState<Capa | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<{ capa: Capa }>(`/capas/${id}`)
      setCapa(data.capa)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load CAPA")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { capa, loading, error, refetch }
}
