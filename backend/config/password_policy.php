<?php

/**
 * Password policy — 21 CFR Part 11 §11.300 requires documented controls
 * over the identification codes and passwords that back electronic
 * signatures. Every value an auditor would ask about lives here rather
 * than being scattered through validation rules.
 *
 * Changing a value here changes it at every entry point at once:
 * password reset, user create, user update, and tenant provisioning.
 */
return [
    'min_length' => (int) env('PASSWORD_MIN_LENGTH', 12),

    'require_mixed_case' => (bool) env('PASSWORD_REQUIRE_MIXED_CASE', true),
    'require_numbers' => (bool) env('PASSWORD_REQUIRE_NUMBERS', true),
    'require_symbols' => (bool) env('PASSWORD_REQUIRE_SYMBOLS', true),

    /*
     * Check candidate passwords against the HaveIBeenPwned corpus.
     *
     * OFF by default, deliberately. Laravel's uncompromised() rule calls
     * api.pwnedpasswords.com and FAILS OPEN when it cannot be reached —
     * it accepts the password. These containers have no outbound internet
     * by design (ITAR posture), so leaving it on produced a control that
     * reported success while silently accepting "Password123!".
     *
     * Local screening in App\Rules\WeakPasswordCheck covers the realistic
     * case and cannot fail open. Only enable this where egress to
     * api.pwnedpasswords.com is known to work and has been verified.
     */
    'check_breached' => (bool) env('PASSWORD_CHECK_BREACHED', false),

    /*
     * Number of previous passwords that may not be reused. Set to 0 to
     * disable history entirely.
     */
    'history_count' => (int) env('PASSWORD_HISTORY_COUNT', 5),

    /*
     * Forced rotation.
     *
     * OFF by default — not in PROJECT_PLAN.md, which says nothing about
     * password rotation. Came from the reseller compliance matrix
     * (21 CFR Part 11 §11.300(b)) rather than the contracted scope.
     *
     * Set PASSWORD_ROTATION_DAYS=90 to enable. Applies only to the roles
     * below when on — rotating every shop-floor account quarterly
     * generates helpdesk load without meaningfully reducing risk, and
     * tends to push people toward weaker incrementing passwords.
     */
    'rotation_days' => (int) env('PASSWORD_ROTATION_DAYS', 0),

    'rotation_roles' => ['admin', 'qa_manager'],
];
