import type { PasswordPolicy } from "@/lib/auth-store"

/**
 * Client-side mirror of the server's password rules.
 *
 * This is feedback, never enforcement — App\Rules\PasswordPolicy and
 * App\Rules\WeakPasswordCheck remain the only things that decide whether
 * a password is accepted. The point is that a user should not discover a
 * rule by having their submission rejected, so the common cases are
 * predicted here and the rest is caught server-side.
 *
 * The common-word list is deliberately the same shape as the backend's,
 * so the two agree on the cases people actually hit.
 */

export interface PasswordCheck {
  label: string
  met: boolean
}

export interface PasswordAssessment {
  checks: PasswordCheck[]
  /** 0-4. Drives the meter; not a rule. */
  score: number
  label: "Too weak" | "Weak" | "Fair" | "Good" | "Strong"
  /** All hard requirements satisfied as far as the client can tell. */
  allMet: boolean
}

const COMMON_STEMS = [
  "password", "passwort", "pass", "passphrase", "letmein", "welcome",
  "admin", "administrator", "root", "superuser", "guest", "default",
  "qwerty", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm",
  "qazwsx", "qwertz", "azerty", "1q2w3e4r", "1qaz2wsx",
  "iloveyou", "sunshine", "princess", "football", "baseball",
  "dragon", "monkey", "master", "shadow", "michael", "jordan",
  "trustno", "whatever", "freedom", "starwars", "superman",
  "login", "changeme", "secret", "temp", "test", "demo", "sample",
]

const LEET: Record<string, string> = {
  "@": "a", "4": "a", "8": "b", "(": "c", "3": "e", "6": "g",
  "1": "l", "!": "i", "0": "o", "9": "g", "5": "s", "$": "s",
  "7": "t", "+": "t", "2": "z",
}

const MIN_DISTINCT_CHARS = 5

function foldLeet(value: string): string {
  return value.split("").map((c) => LEET[c] ?? c).join("")
}

/**
 * Reduce to the base word: strip trailing digits and punctuation, then
 * fold leetspeak. "P@ssw0rd2026!" -> "password".
 *
 * Order matters — folding first turns the trailing "2026" into letters
 * and the stem never resolves.
 */
function stem(value: string): string {
  const trimmed = value.toLowerCase().replace(/[0-9!@#$%^&*()_+\-=[\]{}|;:'",.<>?/`~\\ ]+$/, "")
  return foldLeet(trimmed).replace(/[^a-z]/g, "")
}

function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function isCommon(password: string): boolean {
  const folded = foldLeet(password.toLowerCase())
  const base = stem(password)

  return COMMON_STEMS.some((word) => {
    if (folded === word || base === word) return true
    return (
      word.length >= 5 &&
      (folded.includes(word) || base.includes(word)) &&
      word.length >= base.length * 0.6
    )
  })
}

/**
 * @param contextTerms Company name, user's own name and email — a
 *   password containing them is rejected server-side however complex.
 */
export function assessPassword(
  password: string,
  policy: PasswordPolicy | null,
  contextTerms: string[] = [],
): PasswordAssessment {
  const minLength = policy?.min_length ?? 12
  const checks: PasswordCheck[] = [
    { label: `At least ${minLength} characters`, met: password.length >= minLength },
  ]

  if (policy?.require_mixed_case ?? true) {
    checks.push({
      label: "Upper and lower case letters",
      met: /[a-z]/.test(password) && /[A-Z]/.test(password),
    })
  }
  if (policy?.require_numbers ?? true) {
    checks.push({ label: "At least one number", met: /[0-9]/.test(password) })
  }
  if (policy?.require_symbols ?? true) {
    checks.push({ label: "At least one symbol", met: /[^A-Za-z0-9]/.test(password) })
  }

  const distinct = new Set(password.toLowerCase().split("")).size
  checks.push({
    label: "Not a common or easily guessed password",
    met: password.length > 0 && !isCommon(password) && distinct >= MIN_DISTINCT_CHARS,
  })

  const squashed = squash(password)
  const tokens = contextTerms
    .flatMap((term) => term.split(/[^A-Za-z0-9]+/))
    .map(squash)
    .filter((t) => t.length >= 4)

  if (tokens.length > 0) {
    checks.push({
      label: "Does not contain your name or company",
      met: password.length > 0 && !tokens.some((t) => squashed.includes(t)),
    })
  }

  const allMet = password.length > 0 && checks.every((c) => c.met)

  // Meter is a rough entropy read, separate from the pass/fail rules —
  // a password can satisfy every rule and still only be "Good".
  let score = 0
  if (password.length >= minLength) score++
  if (password.length >= minLength + 6) score++
  if (distinct >= 10) score++
  if (/[^A-Za-z0-9]/.test(password) && /[0-9]/.test(password) && /[A-Z]/.test(password)) score++
  if (!allMet) score = Math.min(score, 1)

  const label = (["Too weak", "Weak", "Fair", "Good", "Strong"] as const)[score] ?? "Too weak"

  return { checks, score, label, allMet }
}
