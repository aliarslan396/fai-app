/**
 * Detect tenant from subdomain.
 * 2 parts (admicomhub.com) → master (no tenant)
 * 3+ parts (acme.admicomhub.com) → tenant "acme"
 * Exception: localhost/127.0.0.1 are always master.
 */

const ALWAYS_CENTRAL = ["localhost", "127.0.0.1"]

export function getTenantSlug(): string | null {
  if (typeof window === "undefined") return null

  const host = window.location.hostname
  const cleanHost = host.split(":")[0]

  // Localhost / IP always master
  for (const central of ALWAYS_CENTRAL) {
    if (cleanHost === central) return null
  }

  const parts = cleanHost.split(".")

  // Single-segment host (e.g. acme.localhost = 2 parts, but localhost handled above)
  // localhost subdomain form: acme.localhost → 2 parts → tenant
  if (parts.length === 2 && parts[1] === "localhost") {
    return parts[0]
  }

  // Production: 2 parts (e.g. admicomhub.com) = master
  // 3+ parts (e.g. acme.admicomhub.com) = tenant
  if (parts.length < 3) return null

  return parts[0]
}

export function isTenantContext(): boolean {
  return getTenantSlug() !== null
}

export function isMasterContext(): boolean {
  return getTenantSlug() === null
}

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"
  }

  const port = window.location.port ? `:${window.location.port}` : ""
  // Local dev: frontend on :3000, backend on :8000
  // Production: Caddy on :443, same host (no port swap needed)
  const apiPort = port === ":3000" ? ":8000" : port
  return `${window.location.protocol}//${window.location.hostname.replace(/:\d+$/, "")}${apiPort}/api/v1`
}

/**
 * Resolve a logo URL to absolute URL.
 * Backend returns paths like "/storage/tenant-logos/...".
 */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  if (typeof window === "undefined") return url

  const apiOrigin = getApiBaseUrl().replace(/\/api\/v1\/?$/, "")
  return `${apiOrigin}${url}`
}
