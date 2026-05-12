<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * CENTRAL database seeder.
 * Creates master super admin only.
 * Tenant-scoped data is seeded via TenantDatabaseSeeder when a tenant is created.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Master super admin — manages all tenants
        User::firstOrCreate(
            ['email' => 'admin@fai.app'],
            [
                'name' => 'Master Admin',
                'password' => Hash::make('password'),
                'master_role' => 'super_admin',
                'status' => 'active',
                'email_verified_at' => now(),
            ]
        );
    }
}
