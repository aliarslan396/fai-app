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
            // Doc §7.3 splits "Inspections (own)" from "Inspections (all)".
            // Without view_all a user only sees sessions they created.
            'inspections.view_all',
            'inspections.create',
            'inspections.edit',
            'inspections.delete',
            'inspections.sign',
            'inspections.export',

            // NCR / CAPA
            'ncr.view',
            'ncr.create',
            'ncr.edit',
            'ncr.disposition',
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

        // Track which permissions this run introduces. Existing roles keep
        // whatever an admin configured for them, but they still need to
        // receive permissions that did not exist when they were last tuned
        // — otherwise a new release silently strips capability from them.
        $newPermissions = [];
        foreach ($permissions as $permission) {
            $model = Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
            if ($model->wasRecentlyCreated) {
                $newPermissions[] = $permission;
            }
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

            // Doc §7.3 read-only roles. doc_controller and trainer share
            // an identical View-everything profile in the matrix; auditor
            // adds org-wide inspection visibility and full report access.
            'doc_controller' => [
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
            'trainer' => [
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
            'auditor' => [
                'parts.view',
                'customers.view',
                'plans.view',
                'drawings.view',
                'inspections.view',
                'inspections.view_all',
                'inspections.export',
                'ncr.view',
                'capa.view',
                'gauges.view',
                'reports.view',
                'reports.export',
            ],
        ];

        foreach ($roles as $roleName => $rolePermissions) {
            $role = Role::where('name', $roleName)->where('guard_name', 'web')->first();

            if (! $role) {
                Role::create(['name' => $roleName, 'guard_name' => 'web'])
                    ->syncPermissions($rolePermissions);
                continue;
            }

            // The role already exists, so an admin may have tuned it via
            // the Customizable Rights UI (doc §3 / Timothy Aug 26). This
            // seeder runs on every deploy, so a blanket re-sync here would
            // silently revert their choices.
            //
            // `admin` is the one exception: RolesController treats it as
            // immutable and always-everything, so it always re-syncs.
            if ($roleName === 'admin') {
                $role->syncPermissions($rolePermissions);
                continue;
            }

            // For every other existing role, grant only the permissions
            // this release introduced that belong in its default profile.
            // Anything the admin previously added or removed is untouched.
            $toGrant = array_intersect($newPermissions, $rolePermissions);
            if ($toGrant !== []) {
                $role->givePermissionTo($toGrant);
            }
        }
    }
}
