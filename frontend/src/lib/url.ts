/**
 * Build a tenant URL based on the current host.
 * Production: https://acme.admicomhub.com/path
 * Dev: http://acme.localhost:3000/path
 */
export function tenantUrl(subdomain: string, path = ""): string {
  if (typeof window === "undefined") {
    return `https://${subdomain}.example.com${path}`
  }

  const proto = window.location.protocol
  const port = window.location.port ? `:${window.location.port}` : ""
  const hostname = window.location.hostname

  // localhost dev: subdomain.localhost:3000
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${proto}//${subdomain}.localhost${port}${path}`
  }

  // Production: replace first subdomain (or prepend) with new subdomain
  const parts = hostname.split(".")
  let baseDomain: string
  if (parts.length >= 3) {
    // Already a subdomain — strip and replace
    baseDomain = parts.slice(1).join(".")
  } else {
    // Root domain — use as base
    baseDomain = hostname
  }

  return `${proto}//${subdomain}.${baseDomain}${port}${path}`
}

/**
 * Display name for tenant URL (without protocol).
 */
export function tenantDisplayHost(subdomain: string): string {
  if (typeof window === "undefined") return `${subdomain}.example.com`
  const hostname = window.location.hostname
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${subdomain}.localhost`
  }
  const parts = hostname.split(".")
  const baseDomain = parts.length >= 3 ? parts.slice(1).join(".") : hostname
  return `${subdomain}.${baseDomain}`
}
