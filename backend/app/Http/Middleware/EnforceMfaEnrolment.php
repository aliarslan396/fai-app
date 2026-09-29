<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Requires TOTP enrolment for privileged roles.
 *
 * TOTP already existed but was opt-in for everyone, including the roles
 * that sign AS9102 forms, close NCRs and decide what other roles may do.
 * A stolen password on a qa_manager account was therefore enough to
 * forge an electronic signature — which is precisely what 21 CFR Part 11
 * §11.300 exists to prevent.
 *
 * Returns 403 with a machine-readable code rather than redirecting: this
 * is an API, and the frontend needs to tell "enrol in MFA" apart from
 * "you are not allowed here". The routes needed to actually enrol are
 * exempt, otherwise the user is locked out of the only action that would
 * let them in.
 */
class EnforceMfaEnrolment
{
    private const EXEMPT_SUFFIXES = [
        'auth/mfa/setup',
        'auth/mfa/confirm',
        'auth/logout',
        'auth/me',
        'auth/change-password',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $this->requiresMfa($user)) {
            return $next($request);
        }

        foreach (self::EXEMPT_SUFFIXES as $suffix) {
            if ($request->is("*{$suffix}")) {
                return $next($request);
            }
        }

        if (! $user->hasMfaEnabled()) {
            return response()->json([
                'message' => 'Two-factor authentication is required for your role. Set it up to continue.',
                'code' => 'MFA_REQUIRED',
            ], 403);
        }

        return $next($request);
    }

    private function requiresMfa(object $user): bool
    {
        // Master super admins can provision, suspend and purge every
        // tenant, so they are privileged by definition rather than by role.
        if (isset($user->master_role)) {
            return (bool) config('session_policy.mfa_required_for_master');
        }

        $roles = (array) config('session_policy.mfa_required_roles');

        return $roles !== [] && method_exists($user, 'hasAnyRole') && $user->hasAnyRole($roles);
    }
}
