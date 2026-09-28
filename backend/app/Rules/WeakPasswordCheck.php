<?php

namespace App\Rules;

/**
 * Local weak-password screening.
 *
 * Laravel's `uncompromised()` calls HaveIBeenPwned over the network and
 * FAILS OPEN when the service cannot be reached. This deployment has no
 * outbound internet by design (ITAR posture), so that rule silently
 * accepted "Password123!" while the policy claimed breach checking was
 * enforced — a control that reports success while doing nothing is worse
 * than no control at all.
 *
 * This runs entirely locally and therefore cannot fail open. It catches
 * the realistic failure mode — a person choosing something obvious —
 * rather than trying to replicate a full breach corpus:
 *
 *   1. Common passwords and keyboard walks, compared after normalising
 *      leetspeak so "P@ssw0rd" is caught alongside "password".
 *   2. Context terms: the tenant name, the product, the user's own email
 *      local-part. "Boeing2026!" satisfies every complexity rule and is
 *      still a bad password for someone at Boeing.
 *   3. Low-entropy shapes: a single repeated character, or a pure
 *      sequence run.
 */
class WeakPasswordCheck
{
    /**
     * Common passwords and stems. Stored normalised (lowercase, no
     * leetspeak) since candidates are normalised before comparison.
     */
    private const COMMON = [
        'password', 'passwort', 'pass', 'passphrase', 'letmein', 'welcome',
        'admin', 'administrator', 'root', 'superuser', 'guest', 'default',
        'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm',
        'qazwsx', 'qwertz', 'azerty', '1q2w3e4r', '1qaz2wsx',
        'iloveyou', 'sunshine', 'princess', 'football', 'baseball',
        'dragon', 'monkey', 'master', 'shadow', 'michael', 'jordan',
        'trustno', 'whatever', 'freedom', 'starwars', 'superman',
        'login', 'changeme', 'secret', 'temp', 'test', 'demo', 'sample',
        'abc', 'abcd', 'aaa', 'qwe', 'asd',
    ];

    /** Terms specific to this product and deployment. */
    private const CONTEXT = [
        'fai', 'faimanager', 'admi', 'admicomhub', 'aerospace',
        'inspection', 'quality', 'as9100', 'as9102',
    ];

    /**
     * Minimum distinct characters, case-insensitive. Five is low enough
     * that no realistic passphrase trips it and high enough to catch
     * padded single-character passwords.
     */
    private const MIN_DISTINCT_CHARS = 5;

    private const LEET = [
        '@' => 'a', '4' => 'a', '8' => 'b', '(' => 'c', '3' => 'e',
        '6' => 'g', '1' => 'l', '!' => 'i', '0' => 'o', '9' => 'g',
        '5' => 's', '$' => 's', '7' => 't', '+' => 't', '2' => 'z',
    ];

    /**
     * @param  string[]  $extraTerms  Tenant name, user email, etc.
     * @return string|null  Reason for rejection, or null if acceptable.
     */
    public static function reject(string $password, array $extraTerms = []): ?string
    {
        $normalised = self::normalise($password);

        if ($normalised === '') {
            return null;
        }

        // The decorations people add to a weak base — trailing years,
        // digits and punctuation — must come off BEFORE leetspeak is
        // folded, otherwise "Welcome2026!" normalises to gibberish
        // instead of reducing to "welcome".
        $stem = self::stem($password);

        foreach (self::COMMON as $common) {
            if ($normalised === $common || $stem === $common) {
                return 'This is one of the most commonly used passwords. Choose something less predictable.';
            }
            // Only flag a contained common word when it dominates the
            // password, so a long passphrase that happens to include
            // "master" is not rejected.
            if (strlen($common) >= 5
                && (str_contains($normalised, $common) || str_contains($stem, $common))
                && strlen($common) >= strlen($stem) * 0.6) {
                return 'This password is built around a commonly used word. Choose something less predictable.';
            }
        }

        // Compare context terms against a letters-and-digits-only form so
        // a multi-word name ("QA Manager") still matches "QaManager2026!".
        $squashed = self::squash($password);

        // Terms arrive as whole names and addresses — "Boeing Aerospace",
        // "qa.manager@admi.test". Match on their individual words too,
        // otherwise "Boeing2026!Xy" passes because it does not contain
        // the full company name.
        $terms = self::CONTEXT;
        foreach ($extraTerms as $raw) {
            foreach (preg_split('/[^A-Za-z0-9]+/', (string) $raw) ?: [] as $token) {
                $token = self::squash($token);
                if (strlen($token) >= 4) {
                    $terms[] = $token;
                }
            }
        }

        foreach (array_unique($terms) as $term) {
            if (strlen($term) >= 3 && (str_contains($normalised, $term) || str_contains($squashed, $term))) {
                return 'Your password must not contain your name, email, or the company name.';
            }
        }

        // Character variety. "Aaaaaaaaaaa1!" satisfies length, mixed case,
        // number and symbol while carrying almost no entropy — a handful
        // of distinct characters padded out. Counted case-insensitively
        // so "AAAAaaaa1!" does not read as twice as varied as it is.
        $distinct = count(array_unique(str_split(mb_strtolower($password))));
        if ($distinct < self::MIN_DISTINCT_CHARS) {
            return 'Your password repeats too few characters. Mix in more variety.';
        }

        if (self::isSequenceRun($normalised)) {
            return 'Your password cannot be a simple sequence.';
        }

        return null;
    }

    private static function normalise(string $value): string
    {
        return strtr(mb_strtolower(trim($value)), self::LEET);
    }

    /**
     * Lowercase, strip everything that is not a letter or digit. Used for
     * context-term matching so "QA Manager" matches "QaManager2026!".
     */
    private static function squash(string $value): string
    {
        return preg_replace('/[^a-z0-9]/', '', mb_strtolower(trim($value))) ?? '';
    }

    /**
     * Reduce a password to its base word by removing trailing digits and
     * punctuation, then folding leetspeak. "P@ssw0rd2026!" -> "password".
     */
    private static function stem(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = rtrim($value, "0123456789!@#$%^&*()_+-=[]{}|;:'\",.<>?/`~\\ ");
        $value = strtr($value, self::LEET);
        return preg_replace('/[^a-z]/', '', $value) ?? '';
    }

    /** True when every character steps by the same ±1 delta, e.g. abcdef / 987654. */
    private static function isSequenceRun(string $value): bool
    {
        if (strlen($value) < 4) {
            return false;
        }

        $delta = ord($value[1]) - ord($value[0]);
        if ($delta !== 1 && $delta !== -1) {
            return false;
        }

        for ($i = 1, $len = strlen($value); $i < $len; $i++) {
            if (ord($value[$i]) - ord($value[$i - 1]) !== $delta) {
                return false;
            }
        }

        return true;
    }
}
