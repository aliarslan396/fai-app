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
            // Exact match wins if the value has no wildcard/space; otherwise
            // fall back to substring so the free-text field still works.
            if (preg_match('/^[a-z0-9_.-]+$/i', $action)) {
                $query->where('action', $action);
            } else {
                $query->where('action', 'ilike', "%{$action}%");
            }
        }

        if ($from = $request->input('date_from')) {
            try {
                $query->where('created_at', '>=', new \DateTimeImmutable($from));
            } catch (\Throwable) {
                // silently ignore malformed date
            }
        }

        if ($to = $request->input('date_to')) {
            try {
                // Inclusive of the end date — bump to end of day.
                $end = (new \DateTimeImmutable($to))->modify('+1 day');
                $query->where('created_at', '<', $end);
            } catch (\Throwable) {
                // silently ignore malformed date
            }
        }

        $logs = $query->orderByDesc('id')
            ->paginate($request->input('per_page', 50));

        return response()->json($logs);
    }

    /**
     * Distinct action strings observed across the audit log. Powers the
     * action-type dropdown on the master activity page so the UI does
     * not have to guess what actions exist.
     */
    public function actions(Request $request): JsonResponse
    {
        $this->authorizeMaster($request);

        $actions = CentralAuditLog::query()
            ->select('action')
            ->distinct()
            ->orderBy('action')
            ->pluck('action');

        return response()->json(['actions' => $actions]);
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
