<?php

namespace App\Http\Controllers\Central;

use App\Http\Controllers\Controller;
use App\Models\CentralAuditLog;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Master cross-tenant audit log viewer.
 * Includes central audit log + per-tenant logs aggregated.
 */
class CentralAuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeMaster($request);

        $query = CentralAuditLog::query()
            ->with('user:id,name,email');

        if ($tenantId = $request->input('tenant_id')) {
            $query->where('tenant_id', $tenantId);
        }

        if ($action = $request->input('action')) {
            $query->where('action', 'ilike', "%{$action}%");
        }

        $logs = $query->orderByDesc('id')
            ->paginate($request->input('per_page', 50));

        return response()->json($logs);
    }

    public function tenantActivity(Request $request, string $id): JsonResponse
    {
        $this->authorizeMaster($request);

        $tenant = Tenant::findOrFail($id);

        $logs = collect();
        try {
            $tenant->run(function () use (&$logs, $request) {
                $logs = \DB::table('audit_logs')
                    ->leftJoin('users', 'users.id', '=', 'audit_logs.user_id')
                    ->select(
                        'audit_logs.id',
                        'audit_logs.action',
                        'audit_logs.ip_address',
                        'audit_logs.meta',
                        'audit_logs.created_at',
                        'users.name as user_name',
                        'users.email as user_email'
                    )
                    ->orderByDesc('audit_logs.id')
                    ->limit($request->input('per_page', 50))
                    ->get();
            });
        } catch (\Throwable $e) {
            // Tenant DB unavailable
        }

        return response()->json([
            'tenant' => $tenant,
            'logs' => $logs,
        ]);
    }

    private function authorizeMaster(Request $request): void
    {
        $user = $request->user();
        if (! $user instanceof \App\Models\User || ! $user->isSuperAdmin()) {
            abort(403, 'Master super admin access required');
        }
    }
}
