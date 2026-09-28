<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Blocks privileged accounts whose password is past its rotation window
 * (21 CFR Part 11 §11.300(b)).
 *
 * Deliberately returns 403 with a machine-readable code rather than
 * redirecting: this is an API, and the frontend needs to distinguish
 * "rotate your password" from "you are not allowed here" in order to
 * show the right screen.
 *
 * The routes needed to actually resolve the state — change-password,
 * logout, and /me — are exempt, otherwise the user is locked out of the
 * only action that would let them back in.
 */
class EnforcePasswordRotation
{
    private const EXEMPT_SUFFIXES = [
        'auth/change-password',
        'auth/logout',
        'auth/me',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! method_exists($user, 'passwordExpired')) {
            return $next($request);
        }

        foreach (self::EXEMPT_SUFFIXES as $suffix) {
            if ($request->is("*{$suffix}")) {
                return $next($request);
            }
        }

        if ($user->passwordExpired()) {
            return response()->json([
                'message' => 'Your password has expired and must be changed before continuing.',
                'code' => 'PASSWORD_EXPIRED',
                'rotation_days' => (int) config('password_policy.rotation_days'),
            ], 403);
        }

        return $next($request);
    }
}
