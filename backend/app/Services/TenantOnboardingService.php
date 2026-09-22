<?php

namespace App\Services;

use App\Mail\TenantAdminInvite;
use App\Models\CentralAuditLog;
use App\Models\Tenant;
use App\Models\TenantUser;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Stancl\Tenancy\Database\Models\Domain;

/**
 * Provisions a new tenant:
 * 1. Validates input
 * 2. Creates tenant record
 * 3. Creates tenant database (auto)
 * 4. Runs tenant migrations
 * 5. Seeds tenant roles/permissions
 * 6. Creates first admin user inside tenant DB
 * 7. Adds domain (subdomain mapping)
 */
class TenantOnboardingService
{
    /**
     * Reserved subdomains that cannot be used for tenants.
     * Prevents conflicts with platform-level routes and infrastructure subdomains.
     */
    private const RESERVED_SUBDOMAINS = [
        'www', 'api', 'admin', 'app', 'apps', 'master', 'mail', 'email', 'smtp', 'imap',
        'ftp', 'ssh', 'cdn', 'static', 'assets', 'media', 'images', 'docs', 'help',
        'support', 'blog', 'status', 'health', 'auth', 'login', 'signup', 'register',
        'dashboard', 'console', 'panel', 'portal', 'account', 'billing', 'pay',
        'stripe', 'webhook', 'webhooks', 'api-v1', 'api-v2', 'graphql', 'rest',
        'staging', 'stage', 'dev', 'test', 'demo', 'sandbox', 'beta', 'alpha',
        'production', 'prod', 'qa', 'uat', 'preview', 'review',
        'ns1', 'ns2', 'mx', 'mx1', 'mx2', 'dns', 'localhost', 'root',
        'fai', 'faimanager', 'faiplatform',
    ];

    /**
     * @return array{tenant: Tenant, admin_email: string, login_url: string, email_sent: bool}
     */
    public function signup(array $data): array
    {
        $validator = Validator::make($data, [
            'company_name' => 'required|string|min:2|max:100',
            'subdomain' => [
                'required',
                'string',
                'min:2',
                'max:30',
                'regex:/^[a-z0-9][a-z0-9-]*[a-z0-9]$/',
                'unique:tenants,subdomain',
                function ($attribute, $value, $fail) {
                    if (in_array(strtolower($value), self::RESERVED_SUBDOMAINS)) {
                        $fail('This subdomain is reserved and cannot be used.');
                    }
                },
            ],
            'admin_name' => 'required|string|min:2|max:100',
            'admin_email' => 'required|email',
            'admin_password' => 'required|string|min:8',
        ]);

        $validator->validate();

        $subdomain = strtolower($data['subdomain']);
        $slug = Str::slug($data['company_name']);

        // Ensure slug uniqueness
        $baseSlug = $slug;
        $i = 1;
        while (Tenant::where('slug', $slug)->exists()) {
            $slug = $baseSlug . '-' . $i++;
        }

        // Create tenant + DB (stancl handles DB creation via DatabaseTenancyBootstrapper)
        $tenant = Tenant::create([
            'id' => $subdomain,
            'name' => $data['company_name'],
            'slug' => $slug,
            'subdomain' => $subdomain,
            'status' => 'trial',
            'user_limit' => 10,
            'trial_ends_at' => now()->addDays(14),
        ]);

        // Add subdomain mapping
        $appDomain = config('app.domain', 'localhost');
        $tenant->domains()->create([
            'domain' => $subdomain . '.' . $appDomain,
        ]);

        // Run migrations + seeders inside tenant DB
        $tenant->run(function () use ($data) {
            \Artisan::call('migrate', [
                '--path' => 'database/migrations/tenant',
                '--realpath' => false,
                '--force' => true,
            ]);

            \Artisan::call('db:seed', [
                '--class' => 'Database\\Seeders\\TenantDatabaseSeeder',
                '--force' => true,
            ]);

            // Create first admin user inside tenant DB
            $admin = TenantUser::create([
                'name' => $data['admin_name'],
                'email' => $data['admin_email'],
                'password' => Hash::make($data['admin_password']),
                'status' => 'active',
                'email_verified_at' => now(),
            ]);
            $admin->assignRole('admin');
        });

        CentralAuditLog::record('tenant.created', [
            'tenant_id' => $tenant->id,
            'subject_type' => Tenant::class,
            'subject_id' => $tenant->id,
            'meta' => [
                'subdomain' => $subdomain,
                'admin_email' => $data['admin_email'],
            ],
        ]);

        $protocol = request()->isSecure() ? 'https' : 'http';
        $port = request()->getPort();
        $portSuffix = in_array($port, [80, 443]) ? '' : ':' . $port;
        $loginUrl = $protocol . '://' . $subdomain . '.' . $appDomain . $portSuffix . '/login';

        // Send the admin invite email. Any mail failure is soft — the
        // provision itself already succeeded and the caller still gets
        // the password back so it can be relayed manually if needed.
        $emailSent = false;
        try {
            Mail::send(new TenantAdminInvite(
                tenant: $tenant,
                adminName: $data['admin_name'],
                adminEmail: $data['admin_email'],
                adminPassword: $data['admin_password'],
                loginUrl: $loginUrl,
            ));
            $emailSent = true;
        } catch (\Throwable $e) {
            Log::warning('TenantAdminInvite email failed', [
                'tenant_id' => $tenant->id,
                'admin_email' => $data['admin_email'],
                'error' => $e->getMessage(),
            ]);
        }

        return [
            'tenant' => $tenant,
            'admin_email' => $data['admin_email'],
            'login_url' => $loginUrl,
            'email_sent' => $emailSent,
        ];
    }

    public function suspend(Tenant $tenant): void
    {
        $tenant->update(['status' => 'suspended']);

        // Revoke all active tokens — instant force-logout for all users
        $this->revokeAllTokens($tenant);

        CentralAuditLog::record('tenant.suspended', [
            'tenant_id' => $tenant->id,
            'subject_type' => Tenant::class,
            'subject_id' => $tenant->id,
        ]);
    }

    public function activate(Tenant $tenant): void
    {
        $tenant->update(['status' => 'active']);
        CentralAuditLog::record('tenant.activated', [
            'tenant_id' => $tenant->id,
            'subject_type' => Tenant::class,
            'subject_id' => $tenant->id,
        ]);
    }

    /**
     * Soft-delete a tenant: flip to cancelled, stamp deleted_at + purge_at,
     * and revoke every user token so their app instantly kicks them out.
     * The DB stays alive for `graceDays` (default 30) so a super admin can
     * still Restore the tenant if this was a mistake — after which the
     * daily `tenants:purge` command hard-drops the DB.
     */
    public function delete(Tenant $tenant, int $graceDays = 30): void
    {
        $tenant->update([
            'status' => 'cancelled',
            'deleted_at' => now(),
            'purge_at' => now()->addDays($graceDays),
        ]);

        $this->revokeAllTokens($tenant);

        CentralAuditLog::record('tenant.marked_for_deletion', [
            'tenant_id' => $tenant->id,
            'subject_type' => Tenant::class,
            'subject_id' => $tenant->id,
            'meta' => [
                'subdomain' => $tenant->subdomain,
                'grace_days' => $graceDays,
                'purge_at' => $tenant->purge_at->toIso8601String(),
            ],
        ]);
    }

    /**
     * Restore a tenant that is inside its grace window. Clears the delete
     * stamps and flips status back to active. Users can log in again on
     * their next request.
     */
    public function restore(Tenant $tenant): void
    {
        if (! $tenant->isMarkedForDeletion()) {
            return;
        }

        $tenant->update([
            'status' => 'active',
            'deleted_at' => null,
            'purge_at' => null,
        ]);

        CentralAuditLog::record('tenant.restored', [
            'tenant_id' => $tenant->id,
            'subject_type' => Tenant::class,
            'subject_id' => $tenant->id,
            'meta' => ['subdomain' => $tenant->subdomain],
        ]);
    }

    /**
     * Hard-drop the tenant + its DB. Called by the daily `tenants:purge`
     * command once `purge_at` has passed. Do not call directly from a
     * controller — always go through the grace-window path.
     */
    public function purge(Tenant $tenant): void
    {
        $tenantId = $tenant->id;
        $subdomain = $tenant->subdomain;

        $tenant->delete(); // stancl auto-drops the tenant DB

        CentralAuditLog::record('tenant.purged', [
            'tenant_id' => $tenantId,
            'meta' => ['subdomain' => $subdomain],
        ]);
    }

    /**
     * Delete every Sanctum personal_access_token in the tenant DB.
     * Forces all logged-in users to be kicked out on their next request.
     */
    private function revokeAllTokens(Tenant $tenant): void
    {
        $tenant->run(function () {
            \DB::table('personal_access_tokens')->delete();
        });
    }
}
