<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/**
 * Seeds roles + permissions inside a tenant's database.
 * Runs once per tenant on creation.
 */
class TenantRoleSeeder extends Seeder
{
    public function run(): void
    {
        // Permissions grouped by module
        $permissions = [
            // User management
            'users.view',
            'users.create',
            'users.edit',
            'users.disable',
            'users.delete',

            // Parts
            'parts.view',
            'parts.create',
            'parts.edit',
            'parts.delete',

            // Customers (master data)
            'customers.view',
            'customers.create',
            'customers.edit',
            'customers.delete',

            // Inspection plans
            'plans.view',
            'plans.create',
            'plans.edit',
            'plans.delete',

            // Drawings
            'drawings.view',
            'drawings.upload',
            'drawings.delete',
            'drawings.bubble.create',
            'drawings.bubble.edit',
            'drawings.bubble.delete',

            // Inspections
            'inspections.view',
            'inspections.create',
            'inspections.edit',
            'inspections.delete',
            'inspections.sign',
            'inspections.export',

            // NCR / CAPA
            'ncr.view',
            'ncr.create',
            'ncr.edit',
            'ncr.close',
            'capa.view',
            'capa.create',
            'capa.edit',
            'capa.approve',

            // Gauges
            'gauges.view',
            'gauges.create',
            'gauges.edit',
            'gauges.calibrate',

            // Reports
            'reports.view',
            'reports.export',

            // Tenant admin
            'tenant.settings',
            'tenant.billing',
        ];

        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        // Roles with permissions
        $roles = [
            'admin' => $permissions, // all
            'qa_manager' => array_filter($permissions, function ($p) {
                return !in_array($p, [
                    'users.create', 'users.disable', 'users.delete',
                    'tenant.settings', 'tenant.billing',
                ]);
            }),
            'qa_inspector' => [
                'users.view',
                'parts.view', 'parts.create', 'parts.edit',
                'customers.view', 'customers.create', 'customers.edit',
                'plans.view', 'plans.create', 'plans.edit',
                'drawings.view', 'drawings.upload', 'drawings.bubble.create', 'drawings.bubble.edit', 'drawings.bubble.delete',
                'inspections.view', 'inspections.create', 'inspections.edit', 'inspections.sign', 'inspections.export',
                'ncr.view', 'ncr.create', 'ncr.edit',
                'gauges.view',
                'reports.view',
            ],
            'shop_floor' => [
                'parts.view',
                'customers.view',
                'plans.view',
                'drawings.view',
                'inspections.view', 'inspections.edit',
                'gauges.view',
            ],
            'viewer' => [
                'parts.view',
                'customers.view',
                'plans.view',
                'drawings.view',
                'inspections.view',
                'ncr.view',
                'capa.view',
                'gauges.view',
                'reports.view',
            ],
        ];

        foreach ($roles as $roleName => $rolePermissions) {
            $role = Role::firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);
            $role->syncPermissions($rolePermissions);
        }
    }
}
