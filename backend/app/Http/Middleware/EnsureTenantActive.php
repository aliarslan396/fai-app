<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Block requests when tenant is suspended, cancelled, or trial expired.
 * Runs after InitializeTenancyByDomain.
 */
class EnsureTenantActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $tenant = tenant();

        if (! $tenant) {
            return $next($request);
        }

        if (in_array($tenant->status, ['suspended', 'cancelled'])) {
            return response()->json([
                'message' => 'This workspace has been ' . $tenant->status . '. Contact your administrator.',
                'tenant_status' => $tenant->status,
                'code' => 'TENANT_INACTIVE',
            ], 403);
        }

        // Trial expiration — auto-suspend on first request after expiry
        if ($tenant->status === 'trial' && $tenant->trial_ends_at && $tenant->trial_ends_at->isPast()) {
            $tenant->update(['status' => 'suspended']);

            return response()->json([
                'message' => 'Your trial has expired. Contact your administrator to continue using FAI.',
                'tenant_status' => 'trial_expired',
                'trial_ends_at' => $tenant->trial_ends_at->toIso8601String(),
                'code' => 'TENANT_INACTIVE',
            ], 403);
        }

        return $next($request);
    }
}
