<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Tenant;
use App\Models\TenantUser;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Tenant user CRUD with user_limit enforcement.
 * Runs inside tenant context.
 */
class TenantUserService
{
    private const VALID_ROLES = ['admin', 'qa_manager', 'qa_inspector', 'shop_floor', 'viewer'];

    public function create(array $data): TenantUser
    {
        $tenant = tenant();

        if (! $tenant) {
            throw new \RuntimeException('No tenant context');
        }

        // Enforce user limit BEFORE validation
        $currentCount = TenantUser::count();
        if ($currentCount >= $tenant->user_limit) {
            throw ValidationException::withMessages([
                'user_limit' => [
                    "User limit reached ({$tenant->user_limit}). Upgrade plan to add more users.",
                ],
            ]);
        }

        Validator::make($data, [
            'name' => 'required|string|min:2|max:100',
            'email' => 'required|email|unique:users,email',
            'phone' => 'nullable|string|max:30',
            'password' => 'required|string|min:8',
            'role' => 'required|string|in:' . implode(',', self::VALID_ROLES),
            'status' => 'sometimes|string|in:active,disabled,pending',
        ])->validate();

        $user = TenantUser::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'password' => Hash::make($data['password']),
            'status' => $data['status'] ?? 'active',
            'email_verified_at' => now(),
        ]);

        $user->assignRole($data['role']);

        AuditLog::record('user.created', [
            'subject_type' => TenantUser::class,
            'subject_id' => $user->id,
            'meta' => ['email' => $user->email, 'role' => $data['role']],
        ]);

        return $user->load('roles', 'permissions');
    }

    public function update(TenantUser $user, array $data): TenantUser
    {
        Validator::make($data, [
            'name' => 'sometimes|string|min:2|max:100',
            'email' => 'sometimes|email|unique:users,email,' . $user->id,
            'phone' => 'nullable|string|max:30',
            'password' => 'sometimes|string|min:8',
            'role' => 'sometimes|string|in:' . implode(',', self::VALID_ROLES),
            'status' => 'sometimes|string|in:active,disabled,pending',
        ])->validate();

        $oldValues = $user->only(['name', 'email', 'phone', 'status']);

        $user->fill(array_filter([
            'name' => $data['name'] ?? null,
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'status' => $data['status'] ?? null,
        ], fn ($v) => $v !== null));

        if (isset($data['password'])) {
            $user->password = Hash::make($data['password']);
        }

        $user->save();

        if (isset($data['role'])) {
            $user->syncRoles([$data['role']]);
        }

        AuditLog::record('user.updated', [
            'subject_type' => TenantUser::class,
            'subject_id' => $user->id,
            'old_values' => $oldValues,
            'new_values' => $user->only(['name', 'email', 'phone', 'status']),
        ]);

        return $user->load('roles', 'permissions');
    }

    public function disable(TenantUser $user): TenantUser
    {
        $user->update(['status' => 'disabled']);

        // Revoke active tokens
        $user->tokens()->delete();

        AuditLog::record('user.disabled', [
            'subject_type' => TenantUser::class,
            'subject_id' => $user->id,
        ]);

        return $user;
    }

    public function enable(TenantUser $user): TenantUser
    {
        $user->update(['status' => 'active']);

        AuditLog::record('user.enabled', [
            'subject_type' => TenantUser::class,
            'subject_id' => $user->id,
        ]);

        return $user;
    }

    public function delete(TenantUser $user): void
    {
        $email = $user->email;
        $id = $user->id;

        $user->tokens()->delete();
        $user->delete();

        AuditLog::record('user.deleted', [
            'subject_type' => TenantUser::class,
            'subject_id' => $id,
            'meta' => ['email' => $email],
        ]);
    }

    public function remainingSlots(): int
    {
        $tenant = tenant();
        if (! $tenant) return 0;
        return max(0, $tenant->user_limit - TenantUser::count());
    }
}
