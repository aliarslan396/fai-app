import { useCallback, useEffect, useState } from "react"
import api from "./api"

export type GaugeStatus = "current" | "due" | "overdue" | "out_of_service"
export type CalResult = "pass" | "fail_oot" | "limited_use"

export interface Gauge {
  id: number
  gauge_id: string
  type: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  range: string | null
  resolution: string | null
  location: string | null
  calibration_interval_months: number
  last_calibrated_at: string | null
  next_cal_due: string | null
  out_of_service: boolean
  out_of_service_reason: string | null
  status: GaugeStatus
  days_until_due: number | null
  created_by: number
  created_at: string
  updated_at: string
  creator?: { id: number; name: string } | null
  calibrations?: GaugeCalibration[]
}

export interface GaugeCalibration {
  id: number
  gauge_id: number
  calibrated_at: string
  calibrated_by: string
  cert_number: string | null
  cert_file_path: string | null
  as_found: string | null
  as_left: string | null
  result: CalResult
  notes: string | null
  ncr_id: number | null
  recorded_by: number
  created_at: string
  recorder?: { id: number; name: string } | null
  ncr?: { id: number; ncr_number: string; status: string } | null
}

export const STATUS_LABEL: Record<GaugeStatus, string> = {
  current: "Current",
  due: "Due Soon",
  overdue: "Overdue",
  out_of_service: "Out of Service",
}

export const STATUS_COLOR: Record<GaugeStatus, string> = {
  current: "bg-emerald-100 text-emerald-800 border-emerald-300",
  due: "bg-amber-100 text-amber-800 border-amber-300",
  overdue: "bg-red-100 text-red-800 border-red-300",
  out_of_service: "bg-slate-200 text-slate-800 border-slate-400",
}

export const RESULT_LABEL: Record<CalResult, string> = {
  pass: "Pass",
  fail_oot: "Fail (OOT)",
  limited_use: "Limited Use",
}

export const RESULT_COLOR: Record<CalResult, string> = {
  pass: "bg-emerald-100 text-emerald-800 border-emerald-300",
  fail_oot: "bg-red-100 text-red-800 border-red-300",
  limited_use: "bg-amber-100 text-amber-800 border-amber-300",
}

export function useGauges(options: { status?: GaugeStatus | "" ; type?: string } = {}) {
  const [gauges, setGauges] = useState<Gauge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (options.status) params.status = options.status
      if (options.type) params.type = options.type
      const { data } = await api.get<{ gauges: Gauge[] | { data: Gauge[] } }>("/gauges", { params })
      const list = Array.isArray(data.gauges) ? data.gauges : data.gauges.data
      setGauges(list ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load gauges")
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(options)]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { gauges, loading, error, refetch }
}

export function useGauge(id: number | null) {
  const [gauge, setGauge] = useState<Gauge | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<{ gauge: Gauge }>(`/gauges/${id}`)
      setGauge(data.gauge)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load gauge")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { gauge, loading, error, refetch }
}
