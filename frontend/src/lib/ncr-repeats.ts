import { useCallback, useEffect, useState } from "react"
import api from "./api"

export interface RepeatCluster {
  part_id: number
  part: { id: number; part_number: string; description: string | null } | null
  defect_code: string
  ncr_count: number
  first_at: string
  last_at: string
  latest_ncr: {
    id: number
    ncr_number: string
    part_id: number
    defect_code: string
    capa_id: number | null
    status: string
  } | null
  existing_capa_id: number | null
}

export interface RepeatsResponse {
  clusters: RepeatCluster[]
  window_days: number
  threshold: number
}

export interface RepeatWarning {
  count: number
  window_days: number
  part_id: number
  defect_code: string
  existing_capa_id: number | null
}

export function useNcrRepeats(days = 30, threshold = 3) {
  const [data, setData] = useState<RepeatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<RepeatsResponse>("/ncrs/repeats", {
        params: { days, threshold },
      })
      setData(res.data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load repeat defects")
    } finally {
      setLoading(false)
    }
  }, [days, threshold])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}
