<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sliding idle timeout (21 CFR Part 11 §11.300(d)).
 *
 * Pushes the current token's expires_at forward on every authenticated
 * request. Walk away for longer than the configured window and the next
 * request is rejected — by Sanctum's own guard, since it already checks
 * expires_at, rather than by a parallel mechanism that could disagree
 * with it.
 *
 * This is separate from sanctum.expiration, which caps absolute lifetime
 * from creation regardless of activity. Both apply: a session dies after
 * the idle window OR the absolute cap, whichever comes first.
 *
 * Writes are throttled — extending on literally every request would add
 * an UPDATE to each one for no benefit, since the window is measured in
 * minutes.
 */
class EnforceIdleTimeout
{
    /** Only rewrite expires_at when less than this fraction of the window remains. */
    private const REFRESH_THRESHOLD = 0.5;

    public function handle(Request $request, Closure $next): Response
    {
        $minutes = (int) config('session_policy.idle_timeout_minutes');

        if ($minutes < 1) {
            return $next($request);
        }

        $token = $request->user()?->currentAccessToken();

        // Session-guard requests yield a TransientToken, which is not a
        // persisted model and has nothing to extend.
        if (! $token instanceof Model) {
            return $next($request);
        }

        // A token with no expiry predates this middleware — stamp it now
        // so it joins the sliding window rather than living forever.
        if ($token->expires_at === null) {
            $token->forceFill(['expires_at' => now()->addMinutes($minutes)])->save();
            return $next($request);
        }

        // Throttle the write: extending on every request would add an
        // UPDATE to each one for no benefit when the window is measured
        // in minutes. Only rewrite once past the halfway point.
        $secondsRemaining = now()->diffInSeconds($token->expires_at, false);

        if ($secondsRemaining < $minutes * 60 * self::REFRESH_THRESHOLD) {
            $token->forceFill(['expires_at' => now()->addMinutes($minutes)])->save();
        }

        return $next($request);
    }
}
