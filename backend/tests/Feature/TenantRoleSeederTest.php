<?php

namespace Tests\Feature;

use Database\Seeders\TenantRoleSeeder;
use Illuminate\Support\Facades\Artisan;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Guards the role seeder against two regressions that shipped silently.
 *
 * 1. deploy.yml runs `tenants:seed --class=TenantRoleSeeder` on every
 *    release. The seeder used to call syncPermissions() unconditionally,
 *    so any permission an admin changed through the Customizable Rights
 *    UI was reverted to seeder defaults on the next deploy.
 *
 * 2. Not re-syncing at all has the opposite failure: a permission added
 *    in a later release would never reach roles that already existed,
 *    silently stripping capability from them.
 *
 * Both behaviours are asserted here so neither can come back.
 */
class TenantRoleSeederTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config()->set('database.default', 'sqlite_testing');
        config()->set('database.connections.sqlite_testing', [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
            'foreign_key_constraints' => false,
        ]);
        // spatie ships a sqlite compatibility switch for its migration.
        config()->set('permission.testing', true);

        Artisan::call('migrate', [
            '--path' => 'database/migrations/tenant/2024_01_01_000006_create_tenant_permission_tables.php',
            '--realpath' => false,
            '--force' => true,
        ]);

        $this->seedRoles();
    }

    private function seedRoles(): void
    {
        (new TenantRoleSeeder())->run();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    private function permissionsOf(string $role): array
    {
        return Role::where('name', $role)
            ->firstOrFail()
            ->permissions
            ->pluck('name')
            ->sort()
            ->values()
            ->all();
    }

    /** Doc §7.3 names all six roles; the seeder must create every one. */
    public function test_it_seeds_every_role_named_in_the_doc(): void
    {
        $names = Role::pluck('name')->all();

        foreach (['admin', 'qa_manager', 'qa_inspector', 'doc_controller', 'trainer', 'auditor'] as $expected) {
            $this->assertContains($expected, $names, "Doc §7.3 role [{$expected}] was not seeded");
        }
    }

    /**
     * Doc §7.3 separates "Inspections (own)" from "Inspections (all)".
     * Only admin, quality_mgr and auditor carry the org-wide column.
     */
    public function test_only_doc_specified_roles_can_view_all_inspections(): void
    {
        foreach (['admin', 'qa_manager', 'auditor'] as $role) {
            $this->assertContains('inspections.view_all', $this->permissionsOf($role), "[{$role}] should see all inspections");
        }

        foreach (['qa_inspector', 'shop_floor', 'viewer', 'doc_controller', 'trainer'] as $role) {
            $this->assertNotContains('inspections.view_all', $this->permissionsOf($role), "[{$role}] must be scoped to its own inspections");
        }
    }

    /** Read-only roles must never be able to sign or approve. */
    public function test_read_only_roles_cannot_sign_or_approve(): void
    {
        foreach (['doc_controller', 'trainer', 'auditor', 'viewer'] as $role) {
            $permissions = $this->permissionsOf($role);
            $this->assertNotContains('inspections.sign', $permissions, "[{$role}] must not sign forms");
            $this->assertNotContains('capa.approve', $permissions, "[{$role}] must not approve CAPAs");
            $this->assertNotContains('ncr.close', $permissions, "[{$role}] must not close NCRs");
        }
    }

    /**
     * The regression that shipped: re-running the seeder (every deploy)
     * must not revert permissions an admin set via the Rights UI.
     */
    public function test_reseeding_preserves_admin_customisations(): void
    {
        $role = Role::where('name', 'viewer')->firstOrFail();
        $role->givePermissionTo('inspections.export');
        $role->revokePermissionTo('reports.view');
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $customised = $this->permissionsOf('viewer');
        $this->assertContains('inspections.export', $customised);
        $this->assertNotContains('reports.view', $customised);

        $this->seedRoles();

        $this->assertSame(
            $customised,
            $this->permissionsOf('viewer'),
            'Re-running the seeder reverted a Rights UI customisation'
        );
    }

    /**
     * The opposite failure: a permission introduced by a later release
     * must still reach existing roles whose default profile includes it.
     */
    public function test_reseeding_grants_newly_introduced_permissions(): void
    {
        // Simulate the pre-release state where view_all did not exist.
        Role::where('name', 'qa_manager')->firstOrFail()->revokePermissionTo('inspections.view_all');
        Permission::where('name', 'inspections.view_all')->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $this->assertNotContains('inspections.view_all', $this->permissionsOf('qa_manager'));

        $this->seedRoles();

        $this->assertContains(
            'inspections.view_all',
            $this->permissionsOf('qa_manager'),
            'A newly introduced permission did not reach an existing role'
        );
    }

    /** admin is immutable per RolesController and must hold everything. */
    public function test_admin_always_holds_every_permission(): void
    {
        Role::where('name', 'admin')->firstOrFail()->revokePermissionTo('tenant.billing');
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $this->seedRoles();

        $this->assertSame(
            Permission::count(),
            count($this->permissionsOf('admin')),
            'admin must be re-synced to every permission on each seed'
        );
    }
}
