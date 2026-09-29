<?php

/**
 * Session and MFA controls (21 CFR Part 11 §11.10(d) — system access
 * limited to authorised individuals; §11.300(d) — transaction
 * safeguards). Kept alongside config/password_policy.php so every
 * credential control an auditor asks about lives in one place.
 */
return [
    /*
     * Sliding idle window. Each authenticated request pushes the token's
     * expires_at forward by this many minutes; leave the app alone for
     * longer and the next request is rejected.
     *
     * Enforced through Sanctum's own expires_at check rather than a
     * parallel mechanism, so a stale token fails at the guard rather
     * than deeper in the request.
     */
    'idle_timeout_minutes' => (int) env('SESSION_IDLE_TIMEOUT_MINUTES', 60),

    /*
     * Absolute cap measured from token creation, regardless of activity.
     * Bounds how long a stolen token stays useful even if the thief
     * keeps it warm. Sanctum enforces this via config/sanctum.php,
     * which reads the value below.
     */
    'absolute_lifetime_minutes' => (int) env('SESSION_ABSOLUTE_LIFETIME_MINUTES', 720),

    /*
     * Roles that must enrol in TOTP before they can use the app.
     *
     * These are the roles that sign off AS9102 forms, close NCRs and
     * change what other roles may do. MFA existing but being optional
     * for them is the gap — a stolen password on a qa_manager account
     * is enough to forge an electronic signature.
     *
     * Empty this array to make MFA optional for everyone.
     */
    'mfa_required_roles' => ['admin', 'qa_manager'],

    /*
     * Master super admins require MFA when true.
     *
     * OFF until the master console gains TOTP enrolment endpoints. The
     * central User model carries the two_factor columns and
     * hasMfaEnabled(), but /master/auth has no setup or confirm route —
     * only the tenant side does. Turning this on today would lock the
     * platform's root account out permanently with no way to enrol,
     * and there is no password-reset path on that surface either.
     *
     * Build master MFA endpoints, then flip this.
     */
    'mfa_required_for_master' => (bool) env('MFA_REQUIRED_FOR_MASTER', false),
];
