<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\TenantUser;
use App\Services\TenantUserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Tenant user management — runs in tenant context.
 */
class UserController extends Controller
{
    public function __construct(private TenantUserService $userService) {}

    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('users.view');

        $query = TenantUser::with('roles');

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                    ->orWhere('email', 'ilike', "%{$search}%");
            });
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $users = $query->orderByDesc('created_at')->paginate($request->input('per_page', 25));

        return response()->json([
            'data' => $users->items(),
            'total' => $users->total(),
            'per_page' => $users->perPage(),
            'current_page' => $users->currentPage(),
            'last_page' => $users->lastPage(),
            'remaining_slots' => $this->userService->remainingSlots(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $this->checkPermission('users.view');

        $user = TenantUser::with(['roles', 'permissions'])->findOrFail($id);

        return response()->json(['user' => $user]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->checkPermission('users.create');

        $user = $this->userService->create($request->all());

        return response()->json(['user' => $user], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('users.edit');

        $user = TenantUser::findOrFail($id);
        $user = $this->userService->update($user, $request->all());

        return response()->json(['user' => $user]);
    }

    public function disable(int $id): JsonResponse
    {
        $this->checkPermission('users.disable');

        $user = TenantUser::findOrFail($id);
        $user = $this->userService->disable($user);

        return response()->json(['user' => $user]);
    }

    public function enable(int $id): JsonResponse
    {
        $this->checkPermission('users.disable');

        $user = TenantUser::findOrFail($id);
        $user = $this->userService->enable($user);

        return response()->json(['user' => $user]);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->checkPermission('users.delete');

        $user = TenantUser::findOrFail($id);
        $this->userService->delete($user);

        return response()->json(['message' => 'User deleted']);
    }

    public function bulkAction(Request $request): JsonResponse
    {
        $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer',
            'action' => 'required|in:disable,enable,delete',
        ]);

        $action = $request->input('action');
        $ids = $request->input('ids');

        $required = match ($action) {
            'disable', 'enable' => 'users.disable',
            'delete' => 'users.delete',
        };
        $this->checkPermission($required);

        $users = TenantUser::whereIn('id', $ids)->get();
        $count = 0;

        foreach ($users as $user) {
            try {
                match ($action) {
                    'disable' => $this->userService->disable($user),
                    'enable' => $this->userService->enable($user),
                    'delete' => $this->userService->delete($user),
                };
                $count++;
            } catch (\Throwable $e) {
                // Skip failed
            }
        }

        return response()->json([
            'message' => "{$count} users {$action}d",
            'processed' => $count,
        ]);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
