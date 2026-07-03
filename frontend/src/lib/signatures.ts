import { useCallback, useEffect, useState } from "react"
import api from "./api"

export type SignableType = "FaiForm1" | "CustomInspectionReport"
export type SignatureRole = "inspector" | "qa_manager" | "customer_rep"

export interface SignatureUser {
  id: number
  name: string
  email: string
  cert_number: string | null
  signature_role_title: string | null
}

export interface SignatureRecord {
  id: number
  signable_type: string
  signable_id: number
  signature_role: SignatureRole
  signed_by: number
  signed_at: string
  signature_image_path: string | null
  stamp_image_path: string | null
  image_url: string | null
  stamp_url: string | null
  ip_address: string | null
  user_agent: string | null
  password_verified_at: string | null
  user: SignatureUser | null
}

export const SIGNATURE_ROLE_LABELS: Record<SignatureRole, string> = {
  inspector: "Inspector",
  qa_manager: "QA Manager",
  customer_rep: "Customer Representative",
}

export function useSignatures(signableType: SignableType, signableId: number | null) {
  const [signatures, setSignatures] = useState<SignatureRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!signableId) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<{ signatures: SignatureRecord[] }>("/signatures", {
        params: { signable_type: signableType, signable_id: signableId },
      })
      setSignatures(data.signatures ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load signatures")
    } finally {
      setLoading(false)
    }
  }, [signableType, signableId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { signatures, loading, error, refetch }
}
