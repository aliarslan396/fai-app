<?php

namespace App\Http\Middleware;

use App\Models\TenantUser;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Reject authenticated requests on tenant routes where the resolved
 * user is not a TenantUser. Prevents master tokens being used to
 * access tenant endpoints even though the model resolves correctly
 * via Sanctum's tokenable_type.
 */
class EnsureTenantUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user instanceof TenantUser) {
            return response()->json([
                'message' => 'This endpoint requires a tenant user.',
                'code' => 'WRONG_USER_CONTEXT',
            ], 403);
        }

        return $next($request);
    }
}
