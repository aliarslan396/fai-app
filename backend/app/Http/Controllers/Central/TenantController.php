<?php

namespace App\Http\Controllers\Central;

use App\Http\Controllers\Controller;
use App\Models\CentralAuditLog;
use App\Models\Tenant;
use App\Services\TenantOnboardingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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

        // Enrich each row with a lightweight per-tenant count block.
        // Each tenant's counts are cached for 5 minutes so the master
        // list never re-opens N tenant DB connections on a warm hit —
        // that was the root cause of the intermittent 502s during
        // navigation. Cancelled tenants get zeros without any query.
        $tenants->getCollection()->transform(function (Tenant $t) {
            $arr = $t->toArray();
            $arr['counts'] = $this->tenantCounts($t);
            return $arr;
        });

        return response()->json($tenants);
    }

    private function tenantCounts(Tenant $t): array
    {
        if ($t->status === 'cancelled') {
            return ['users' => 0, 'plans' => 0, 'drawings' => 0];
        }

        return Cache::remember("tenant:{$t->id}:counts", now()->addMinutes(5), function () use ($t) {
            $counts = ['users' => 0, 'plans' => 0, 'drawings' => 0];
            try {
                $t->run(function () use (&$counts) {
                    $counts['users'] = DB::table('users')->whereNull('deleted_at')->count();
                    if (DB::getSchemaBuilder()->hasTable('inspection_plans')) {
                        $counts['plans'] = DB::table('inspection_plans')->count();
                    }
                    if (DB::getSchemaBuilder()->hasTable('drawings')) {
                        $counts['drawings'] = DB::table('drawings')->count();
                    }
                });
            } catch (\Throwable $e) {
                // half-provisioned tenant — return zeros without caching a bad value
                return ['users' => 0, 'plans' => 0, 'drawings' => 0];
            }
            return $counts;
        });
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $this->authorizeMaster($request);

        $tenant = Tenant::findOrFail($id);

        // Detail-page stats are cached for 2 minutes so navigating in
        // and out of a tenant does not re-open its DB every time.
        $stats = Cache::remember("tenant:{$tenant->id}:stats", now()->addMinutes(2), function () use ($tenant) {
            $stats = [
                'user_count' => 0,
                'active_users_30d' => 0,
                'last_activity' => null,
                'plan_count' => 0,
                'drawing_count' => 0,
                'storage_bytes' => 0,
                'ncr_count' => 0,
                'capa_count' => 0,
            ];
            try {
                $tenant->run(function () use (&$stats) {
                    $stats['user_count'] = DB::table('users')->whereNull('deleted_at')->count();

                    $lastLogin = DB::table('audit_logs')
                        ->where('action', 'login.success')
                        ->orderByDesc('created_at')
                        ->first();
                    $stats['last_activity'] = $lastLogin?->created_at;

                    $stats['active_users_30d'] = DB::table('audit_logs')
                        ->where('action', 'login.success')
                        ->where('created_at', '>=', now()->subDays(30))
                        ->distinct()
                        ->count('user_id');

                    if (DB::getSchemaBuilder()->hasTable('inspection_plans')) {
                        $stats['plan_count'] = DB::table('inspection_plans')->count();
                    }
                    if (DB::getSchemaBuilder()->hasTable('drawings')) {
                        $stats['drawing_count'] = DB::table('drawings')->count();
                        $stats['storage_bytes'] = (int) DB::table('drawings')->sum('file_size');
                    }
                    if (DB::getSchemaBuilder()->hasTable('ncrs')) {
                        $stats['ncr_count'] = DB::table('ncrs')->count();
                    }
                    if (DB::getSchemaBuilder()->hasTable('capas')) {
                        $stats['capa_count'] = DB::table('capas')->count();
                    }
                });
            } catch (\Throwable $e) {
                // Tenant DB not initialized — leave defaults
            }
            return $stats;
        });

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
        $this->invalidateCounts($result['tenant']->id);

        return response()->json([
            'message' => 'Tenant created',
            'tenant' => $result['tenant'],
            'admin_email' => $result['admin_email'],
            'login_url' => $result['login_url'],
            'email_sent' => $result['email_sent'],
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
            $this->invalidateCounts($tenant->id);
        }

        return response()->json(['tenant' => $tenant]);
    }

    public function suspend(Request $request, string $id): JsonResponse
    {
        $this->authorizeMaster($request);

        $tenant = Tenant::findOrFail($id);
        $this->onboarding->suspend($tenant);
        $this->invalidateCounts($id);

        return response()->json(['tenant' => $tenant->fresh()]);
    }

    public function activate(Request $request, string $id): JsonResponse
    {
        $this->authorizeMaster($request);

        $tenant = Tenant::findOrFail($id);
        $this->onboarding->activate($tenant);
        $this->invalidateCounts($id);

        return response()->json(['tenant' => $tenant->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->authorizeMaster($request);

        $tenant = Tenant::findOrFail($id);
        $this->onboarding->delete($tenant);
        $this->invalidateCounts($id);

        return response()->json([
            'message' => 'Tenant marked for deletion (30-day grace period)',
            'tenant' => $tenant->fresh(),
        ]);
    }

    public function restore(Request $request, string $id): JsonResponse
    {
        $this->authorizeMaster($request);

        $tenant = Tenant::findOrFail($id);
        $this->onboarding->restore($tenant);
        $this->invalidateCounts($id);

        return response()->json(['tenant' => $tenant->fresh()]);
    }

    private function invalidateCounts(string $id): void
    {
        Cache::forget("tenant:{$id}:counts");
        Cache::forget("tenant:{$id}:stats");
    }

    private function authorizeMaster(Request $request): void
    {
        $user = $request->user();

        if (! $user instanceof \App\Models\User || ! $user->isSuperAdmin()) {
            abort(403, 'Master super admin access required');
        }
    }
}
