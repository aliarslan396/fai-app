<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * TENANT database seeder.
 * Runs INSIDE a tenant's database when the tenant is created.
 * Creates roles + permissions for that tenant.
 *
 * The first admin user is created separately by TenantOnboardingService.
 */
class TenantDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            TenantRoleSeeder::class,
        ]);
    }
}
