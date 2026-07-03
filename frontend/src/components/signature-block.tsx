"use client"

import { Lock } from "lucide-react"

import { AuthImage } from "@/components/auth-image"
import { Badge } from "@/components/ui/badge"
import { SIGNATURE_ROLE_LABELS, type SignatureRecord } from "@/lib/signatures"

interface Props {
  signature: SignatureRecord
  compact?: boolean
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    const hh = String(d.getHours()).padStart(2, "0")
    const mi = String(d.getMinutes()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
  } catch {
    return iso
  }
}

/**
 * Renders one signature: drawn canvas PNG + auto-generated stamp PNG
 * side-by-side, with signer metadata below. Post-sign display block
 * for locked forms.
 */
export function SignatureBlock({ signature, compact = false }: Props) {
  const roleLabel = SIGNATURE_ROLE_LABELS[signature.signature_role] ?? signature.signature_role
  const name = signature.user?.name ?? "Unknown signer"
  const email = signature.user?.email
  const cert = signature.user?.cert_number
  const title = signature.user?.signature_role_title

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-sm font-medium">Signed &amp; Locked</span>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
            {roleLabel}
          </Badge>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {fmtDate(signature.signed_at)}
        </span>
      </div>

      <div className={`grid gap-4 ${compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 md:grid-cols-2"}`}>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Signature
          </div>
          <div className="flex min-h-[110px] items-center justify-center rounded border bg-white p-2">
            {signature.image_url ? (
              <AuthImage
                src={signature.image_url}
                alt={`Signature by ${name}`}
                className="max-h-[110px] w-auto object-contain"
                fallback={<span className="text-xs text-muted-foreground">Image unavailable</span>}
              />
            ) : (
              <span className="text-xs text-muted-foreground">No signature image</span>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            QA Stamp
          </div>
          <div className="flex min-h-[110px] items-center justify-center rounded border bg-white p-2">
            {signature.stamp_url ? (
              <AuthImage
                src={signature.stamp_url}
                alt={`Stamp for ${name}`}
                className="max-h-[110px] w-auto object-contain"
                fallback={<span className="text-xs text-muted-foreground">Stamp unavailable</span>}
              />
            ) : (
              <span className="text-xs text-muted-foreground">No stamp</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <span className="font-medium text-foreground">{name}</span>
          {title && <span className="ml-1">· {title}</span>}
        </div>
        {cert && (
          <div>
            Cert <span className="font-mono">#{cert}</span>
          </div>
        )}
        {email && <div className="truncate">{email}</div>}
        {signature.ip_address && (
          <div>
            From IP <span className="font-mono">{signature.ip_address}</span>
          </div>
        )}
      </div>
    </div>
  )
}
