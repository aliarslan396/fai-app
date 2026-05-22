<?php

namespace App\Http\Controllers\Central;

use App\Http\Controllers\Controller;
use App\Models\CentralAuditLog;
use App\Models\Tenant;
use App\Services\TenantOnboardingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Master super admin tenant management.
 */
class TenantController extends Controller
{
    public function __construct(private TenantOnboardingService $onboarding) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorizeMaster($request);

        $query = Tenant::query();

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                    ->orWhere('subdomain', 'ilike', "%{$search}%")
                    ->orWhere('slug', 'ilike', "%{$search}%");
            });
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $tenants = $query->orderByDesc('created_at')
            ->paginate($request->input('per_page', 25));

        return response()->json($tenants);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $this->authorizeMaster($request);

        $tenant = Tenant::findOrFail($id);

        // Pull stats from tenant DB
        $stats = ['user_count' => 0, 'last_activity' => null];
        try {
            $tenant->run(function () use (&$stats) {
                $stats['user_count'] = DB::table('users')->whereNull('deleted_at')->count();
                $lastLogin = DB::table('audit_logs')
                    ->where('action', 'login.success')
                    ->orderByDesc('created_at')
                    ->first();
                $stats['last_activity'] = $lastLogin?->created_at;
            });
        } catch (\Throwable $e) {
            // Tenant DB not initialized — leave defaults
        }

        // Recent central audit logs for this tenant
        $auditLogs = CentralAuditLog::where('tenant_id', $id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return response()->json([
            'tenant' => $tenant->load('domains'),
            'stats' => $stats,
            'audit_logs' => $auditLogs,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeMaster($request);

        $result = $this->onboarding->signup($request->all());

        return response()->json([
            'message' => 'Tenant created',
            'tenant' => $result['tenant'],
            'admin_email' => $result['admin_email'],
            'login_url' => $result['login_url'],
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorizeMaster($request);

        $tenant = Tenant::findOrFail($id);

        $data = $request->validate([
            'name' => 'sometimes|string|min:2|max:100',
            'logo_url' => 'sometimes|nullable|string|max:500',
            'primary_color' => 'sometimes|string|regex:/^#[0-9A-Fa-f]{6}$/',
            'user_limit' => 'sometimes|integer|min:1|max:10000',
        ]);

        $before = $tenant->only(array_keys($data));
        $tenant->update($data);
        $after = $tenant->only(array_keys($data));

        $changed = collect($after)->filter(fn ($v, $k) => $v != ($before[$k] ?? null))->keys()->all();

        if (! empty($changed)) {
            CentralAuditLog::record('tenant.updated', [
                'tenant_id' => $tenant->id,
                'old_values' => array_intersect_key($before, array_flip($changed)),
                'new_values' => array_intersect_key($after, array_flip($changed)),
                'meta' => ['fields' => $changed],
            ]);
        }

        return response()->json(['tenant' => $tenant]);
    }

    public function suspend(Request $request, string $id): JsonResponse
    {
        $this->authorizeMaster($request);

        $tenant = Tenant::findOrFail($id);
        $this->onboarding->suspend($tenant);

        return response()->json(['tenant' => $tenant->fresh()]);
    }

    public function activate(Request $request, string $id): JsonResponse
    {
        $this->authorizeMaster($request);

        $tenant = Tenant::findOrFail($id);
        $this->onboarding->activate($tenant);

        return response()->json(['tenant' => $tenant->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->authorizeMaster($request);

        $tenant = Tenant::findOrFail($id);
        $this->onboarding->delete($tenant);

        return response()->json(['message' => 'Tenant deleted']);
    }

    private function authorizeMaster(Request $request): void
    {
        $user = $request->user();

        if (! $user instanceof \App\Models\User || ! $user->isSuperAdmin()) {
            abort(403, 'Master super admin access required');
        }
    }
}
