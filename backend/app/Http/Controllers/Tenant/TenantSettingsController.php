<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

/**
 * Tenant settings management — only tenant admins can edit.
 * Updates fields on the central tenants table (name, logo, color).
 */
class TenantSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        $this->checkAccess();

        $t = tenant();

        return response()->json([
            'tenant' => [
                'id' => $t->getTenantKey(),
                'name' => $t->name,
                'slug' => $t->slug,
                'subdomain' => $t->subdomain,
                'logo_url' => $t->logo_url,
                'primary_color' => $t->primary_color,
                'status' => $t->status,
                'user_limit' => $t->user_limit,
                'trial_ends_at' => $t->trial_ends_at?->toIso8601String(),
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->checkAccess();

        Validator::make($request->all(), [
            'name' => 'sometimes|string|min:2|max:100',
            'primary_color' => 'sometimes|string|regex:/^#[0-9A-Fa-f]{6}$/',
        ])->validate();

        $t = tenant();
        $oldValues = $t->only(['name', 'primary_color']);

        // Tenant model is on central connection, save respects that
        $t->update($request->only(['name', 'primary_color']));

        AuditLog::record('tenant.settings.updated', [
            'old_values' => $oldValues,
            'new_values' => $t->only(['name', 'primary_color']),
        ]);

        return response()->json([
            'tenant' => [
                'id' => $t->getTenantKey(),
                'name' => $t->name,
                'logo_url' => $t->logo_url,
                'primary_color' => $t->primary_color,
            ],
        ]);
    }

    public function uploadLogo(Request $request): JsonResponse
    {
        $this->checkAccess();

        Validator::make($request->all(), [
            'logo' => 'required|image|mimes:png,jpg,jpeg,svg,webp|max:2048',
        ])->validate();

        $t = tenant();
        $file = $request->file('logo');
        $extension = strtolower($file->getClientOriginalExtension());
        $filename = "{$t->getTenantKey()}-" . time() . ".{$extension}";

        // Store in CENTRAL public storage (bypass tenant filesystem suffixing)
        // Path: public/tenant-logos/<tenant_id>-<ts>.<ext> → /storage/tenant-logos/...
        $publicDir = base_path('public/storage/tenant-logos');
        if (! is_dir($publicDir)) {
            mkdir($publicDir, 0755, true);
        }

        $file->move($publicDir, $filename);
        $url = '/storage/tenant-logos/' . $filename;

        $oldUrl = $t->logo_url;

        // Tenant model lives on central connection — update via central context
        \DB::connection(config('tenancy.database.central_connection'))
            ->table('tenants')
            ->where('id', $t->getTenantKey())
            ->update(['logo_url' => $url]);

        AuditLog::record('tenant.logo.uploaded', [
            'old_values' => ['logo_url' => $oldUrl],
            'new_values' => ['logo_url' => $url],
        ]);

        return response()->json(['logo_url' => $url]);
    }

    public function removeLogo(): JsonResponse
    {
        $this->checkAccess();

        $t = tenant();
        $oldUrl = $t->logo_url;

        // Delete actual file if it's a local-storage URL
        if ($oldUrl && str_starts_with($oldUrl, '/storage/tenant-logos/')) {
            $localPath = base_path('public' . $oldUrl);
            if (file_exists($localPath)) {
                @unlink($localPath);
            }
        }

        \DB::connection(config('tenancy.database.central_connection'))
            ->table('tenants')
            ->where('id', $t->getTenantKey())
            ->update(['logo_url' => null]);

        AuditLog::record('tenant.logo.removed', [
            'old_values' => ['logo_url' => $oldUrl],
        ]);

        return response()->json(['message' => 'Logo removed']);
    }

    private function checkAccess(): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo('tenant.settings')) {
            abort(403, 'Only tenant admins can edit settings');
        }
    }
}
