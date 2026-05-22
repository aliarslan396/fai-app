<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Reject authenticated requests on master routes where the resolved
 * user is not the central User model with a master_role set.
 */
class EnsureMasterUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user instanceof User || empty($user->master_role)) {
            return response()->json([
                'message' => 'This endpoint requires a master user.',
                'code' => 'WRONG_USER_CONTEXT',
            ], 403);
        }

        return $next($request);
    }
}
