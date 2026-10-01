<?php

/**
 * Session and MFA controls.
 *
 * ── NOT IN THE CLIENT SPEC ──────────────────────────────────────────
 * PROJECT_PLAN.md contains no mention of MFA, session timeout, password
 * rotation or 21 CFR Part 11. Its security requirements are limited to
 * bcrypt hashing, session regeneration on login, and password
 * re-verification before signing (lines 444, 579, 802).
 *
 * These controls came from the aerospace-reseller compliance matrix, on
 * the assumption that a product resold to regulated shops would need
 * them. That is a reasonable assumption but it is not contracted, so
 * everything here ships DISABLED by default and is switched on per
 * deployment via env.
 *
 * Enable when a customer actually asks for Part 11 alignment:
 *   SESSION_IDLE_TIMEOUT_MINUTES=60
 *   SESSION_ABSOLUTE_LIFETIME_MINUTES=720
 *   MFA_REQUIRED_ROLES=admin,qa_manager
 * ─────────────────────────────────────────────────────────────────────
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
    'idle_timeout_minutes' => (int) env('SESSION_IDLE_TIMEOUT_MINUTES', 120),

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
     * Empty (the default) makes MFA optional for everyone — TOTP is
     * still available from the profile page, just not compulsory.
     *
     * Held off deliberately while the client previews the product: a
     * first login that demands an authenticator app before showing
     * anything is a poor front door for someone evaluating it. The
     * enforcement path is built and tested — set the env var to turn
     * it on, per deployment:
     *
     *   MFA_REQUIRED_ROLES=admin,qa_manager
     */
    'mfa_required_roles' => array_filter(explode(',', (string) env('MFA_REQUIRED_ROLES', ''))),

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
