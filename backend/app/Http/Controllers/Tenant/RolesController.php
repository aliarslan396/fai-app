<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/**
 * Roles + Permissions admin — doc §3 / Timothy Aug 26 message: admin
 * can flip per-role permissions via the UI instead of touching the
 * seeder + redeploying.
 *
 * Guards:
 *   - Only users with `users.edit` can list/change (matches the rest
 *     of the admin surface).
 *   - The `admin` role is immutable — it always keeps every permission
 *     so a mis-click can never lock the tenant out of its own admin.
 *   - Only permissions that already exist in the tenant DB can be
 *     assigned (no free-text "made up" scopes).
 *   - Every change writes an audit_logs row with before/after.
 */
class RolesController extends Controller
{
    private const IMMUTABLE_ROLE = 'admin';

    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('users.edit');

        $roles = Role::with('permissions:id,name')->orderBy('name')->get()
            ->map(fn ($r) => [
                'id' => $r->id,
                'name' => $r->name,
                'immutable' => $r->name === self::IMMUTABLE_ROLE,
                'permission_names' => $r->permissions->pluck('name')->values(),
            ]);

        $permissions = Permission::orderBy('name')->pluck('name');

        return response()->json([
            'roles' => $roles,
            'permissions' => $permissions,
            'grouped' => $this->groupByResource($permissions),
        ]);
    }

    public function updatePermissions(Request $request, int $roleId): JsonResponse
    {
        $this->checkPermission('users.edit');

        $data = $request->validate([
            'permission_names' => 'required|array',
            'permission_names.*' => 'string',
        ]);

        $role = Role::findOrFail($roleId);
        if ($role->name === self::IMMUTABLE_ROLE) {
            return response()->json(['message' => 'The admin role cannot be modified — it always has every permission.'], 422);
        }

        // Only allow assigning permissions that already exist in this
        // tenant's DB. Anything else = validation error.
        $existing = Permission::whereIn('name', $data['permission_names'])->pluck('name');
        $unknown = collect($data['permission_names'])->diff($existing)->values();
        if ($unknown->isNotEmpty()) {
            return response()->json([
                'message' => 'Unknown permissions requested.',
                'unknown' => $unknown->all(),
            ], 422);
        }

        $before = $role->permissions->pluck('name')->sort()->values()->all();

        DB::transaction(function () use ($role, $existing) {
            $role->syncPermissions($existing->all());
        });

        $after = $role->refresh()->permissions->pluck('name')->sort()->values()->all();

        AuditLog::record('role.permissions_updated', [
            'subject_type' => Role::class,
            'subject_id' => $role->id,
            'meta' => [
                'role_name' => $role->name,
                'user_id' => $request->user()->id,
                'added' => array_values(array_diff($after, $before)),
                'removed' => array_values(array_diff($before, $after)),
                'total_before' => count($before),
                'total_after' => count($after),
            ],
        ]);

        return response()->json([
            'role' => [
                'id' => $role->id,
                'name' => $role->name,
                'permission_names' => $role->permissions->pluck('name')->values(),
            ],
        ]);
    }

    /** Group permissions by their `resource` prefix so the UI can render sections. */
    private function groupByResource($permissions): array
    {
        $groups = [];
        foreach ($permissions as $name) {
            $resource = str_contains($name, '.') ? explode('.', $name)[0] : 'other';
            $groups[$resource][] = $name;
        }
        ksort($groups);
        return $groups;
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
