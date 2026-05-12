/**
 * Hex (#RRGGBB) → CSS oklch() string.
 * Returns null if invalid.
 */
export function hexToOklch(hex: string): string | null {
  const m = hex.match(/^#([0-9A-Fa-f]{6})$/)
  if (!m) return null

  const r = parseInt(m[1].slice(0, 2), 16) / 255
  const g = parseInt(m[1].slice(2, 4), 16) / 255
  const b = parseInt(m[1].slice(4, 6), 16) / 255

  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b)

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  const L = 0.2104542553 * l + 0.7936177850 * m_ - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.4285922050 * m_ + 0.4505937099 * s
  const bLab = 0.0259040371 * l + 0.7827717662 * m_ - 0.8086757660 * s

  const C = Math.sqrt(a * a + bLab * bLab)
  let H = (Math.atan2(bLab, a) * 180) / Math.PI
  if (H < 0) H += 360

  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(2)})`
}

export function applyPrimaryColor(hex: string | null | undefined): void {
  if (typeof document === "undefined") return

  if (!hex) {
    document.documentElement.style.removeProperty("--primary")
    document.documentElement.style.removeProperty("--ring")
    return
  }

  const oklch = hexToOklch(hex)
  if (oklch) {
    document.documentElement.style.setProperty("--primary", oklch)
    document.documentElement.style.setProperty("--ring", oklch)
  }
}
