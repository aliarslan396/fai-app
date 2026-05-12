/**
 * Detect tenant from subdomain.
 * localhost or 127.0.0.1 → master (no tenant)
 * acme.localhost → tenant "acme"
 * inspections.acme.com → tenant "acme" (production custom domain)
 */

const CENTRAL_HOSTS = ["localhost", "127.0.0.1", "fai.app"]

export function getTenantSlug(): string | null {
  if (typeof window === "undefined") return null

  const host = window.location.hostname

  // Strip port
  const cleanHost = host.split(":")[0]

  // Check if central host
  for (const central of CENTRAL_HOSTS) {
    if (cleanHost === central) return null
  }

  // Extract subdomain (first segment)
  const parts = cleanHost.split(".")
  if (parts.length < 2) return null

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
