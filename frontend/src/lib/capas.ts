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

export type CapaActionType = "containment" | "corrective" | "preventive"

export type CapaActionStatus = "pending" | "in_progress" | "done" | "blocked"

export type CapaEffectivenessResult = "effective" | "ineffective" | "partial"

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

export interface CapaFiveWhyRow {
  id: number
  capa_id: number
  level: number
  why_text: string
  created_by: number
  created_at: string
  updated_at: string
  creator?: CapaUserRef | null
}

export interface CapaActionRow {
  id: number
  capa_id: number
  action_type: CapaActionType
  description: string
  assigned_to: number | null
  due_date: string | null
  status: CapaActionStatus
  completed_at: string | null
  completed_by: number | null
  created_by: number
  created_at: string
  updated_at: string
  assignee?: CapaUserRef | null
  completer?: CapaUserRef | null
  creator?: CapaUserRef | null
}

export interface CapaApprover {
  user_id: number
  user_name: string
  role: string
  note: string | null
  approved_at: string
}

export interface Capa {
  id: number
  capa_number: string
  source: string
  source_ncr_id: number | null
  part_id: number | null
  defect_code: string | null
  problem_statement: string | null
  containment_action: string | null
  root_cause_summary: string | null
  approved_by: CapaApprover[] | null
  approved_at: string | null
  effectiveness_review_date: string | null
  effectiveness_result: CapaEffectivenessResult | null
  effectiveness_notes: string | null
  closed_by: number | null
  closed_at: string | null
  status: CapaStatus
  created_by: number
  created_at: string
  updated_at: string
  source_ncr?: CapaSourceNcrRef | null
  part?: CapaPartRef | null
  creator?: CapaUserRef | null
  closer?: CapaUserRef | null
  five_whys?: CapaFiveWhyRow[]
  actions?: CapaActionRow[]
}

export interface CapaMeta {
  required_approver_roles: string[]
  action_types: CapaActionType[]
  action_statuses: CapaActionStatus[]
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

export const CAPA_ACTION_TYPE_LABEL: Record<CapaActionType, string> = {
  containment: "Containment",
  corrective: "Corrective",
  preventive: "Preventive",
}

export const CAPA_ACTION_TYPE_COLOR: Record<CapaActionType, string> = {
  containment: "bg-red-50 text-red-700 border-red-200",
  corrective: "bg-blue-50 text-blue-700 border-blue-200",
  preventive: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

export const CAPA_ACTION_STATUS_LABEL: Record<CapaActionStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
}

export const CAPA_ACTION_STATUS_COLOR: Record<CapaActionStatus, string> = {
  pending: "bg-slate-100 text-slate-700 border-slate-300",
  in_progress: "bg-blue-100 text-blue-800 border-blue-300",
  done: "bg-emerald-100 text-emerald-800 border-emerald-300",
  blocked: "bg-orange-100 text-orange-800 border-orange-300",
}

/**
 * Tab-lock map — which tab is unlocked at each CAPA status.
 * Higher numbered tabs stay disabled until earlier ones are complete.
 * Once approved, all tabs stay unlocked.
 */
export function tabUnlocked(status: CapaStatus, tab: 1 | 2 | 3 | 4 | 5): boolean {
  switch (tab) {
    case 1:
      return true
    case 2:
      return status !== "open"
    case 3:
      return ["action_plan_pending", "approved", "in_progress", "closed", "ineffective"].includes(status)
    case 4:
      return ["action_plan_pending", "approved", "in_progress", "closed", "ineffective"].includes(status)
    case 5:
      return ["approved", "in_progress", "closed", "ineffective"].includes(status)
  }
}

export function useCapa(id: number | null) {
  const [capa, setCapa] = useState<Capa | null>(null)
  const [meta, setMeta] = useState<CapaMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<{ capa: Capa; meta: CapaMeta }>(`/capas/${id}`)
      setCapa(data.capa)
      setMeta(data.meta)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load CAPA")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { capa, meta, loading, error, refetch }
}

// ---------- mutation helpers (thin axios wrappers) ----------

export async function apiRefineProblem(
  id: number,
  payload: { problem_statement: string; containment_action: string },
) {
  return api.patch<{ capa: Capa }>(`/capas/${id}/problem`, payload)
}

export async function apiSaveFiveWhy(id: number, level: number, why_text: string) {
  return api.post<{ five_why: CapaFiveWhyRow }>(`/capas/${id}/five-whys`, { level, why_text })
}

export async function apiCompleteRootCause(id: number, root_cause_summary: string) {
  return api.post<{ capa: Capa }>(`/capas/${id}/root-cause/complete`, { root_cause_summary })
}

export async function apiAddAction(id: number, payload: {
  action_type: CapaActionType
  description: string
  assigned_to?: number | null
  due_date?: string | null
}) {
  return api.post<{ action: CapaActionRow }>(`/capas/${id}/actions`, payload)
}

export async function apiUpdateAction(
  id: number,
  actionId: number,
  payload: Partial<{
    action_type: CapaActionType
    description: string
    assigned_to: number | null
    due_date: string | null
    status: CapaActionStatus
  }>,
) {
  return api.patch<{ action: CapaActionRow }>(`/capas/${id}/actions/${actionId}`, payload)
}

export async function apiDeleteAction(id: number, actionId: number) {
  return api.delete(`/capas/${id}/actions/${actionId}`)
}

export async function apiApproveCapa(id: number, note?: string) {
  return api.post<{ capa: Capa }>(`/capas/${id}/approve`, { note })
}

export async function apiScheduleEffectiveness(id: number, review_date: string) {
  return api.post<{ capa: Capa }>(`/capas/${id}/effectiveness/schedule`, { review_date })
}

export async function apiCloseCapa(
  id: number,
  result: CapaEffectivenessResult,
  notes?: string,
) {
  return api.post<{ capa: Capa }>(`/capas/${id}/close`, { result, notes })
}
