<?php

namespace App\Services;

use App\Models\CentralAuditLog;
use App\Models\Tenant;
use App\Models\TenantUser;
use Illuminate\Support\Facades\Hash;
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
     * @return array{tenant: Tenant, admin_email: string, login_url: string}
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

        return [
            'tenant' => $tenant,
            'admin_email' => $data['admin_email'],
            'login_url' => $loginUrl,
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

    public function delete(Tenant $tenant): void
    {
        $tenantId = $tenant->id;
        $subdomain = $tenant->subdomain;

        $tenant->delete(); // stancl auto-drops the tenant DB (so tokens die with it)

        CentralAuditLog::record('tenant.deleted', [
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
