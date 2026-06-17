<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Seeds 5 role-based test accounts inside a tenant DB.
 * Idempotent: existing users get pwd reset + role re-synced + MFA cleared.
 * Pwd: Test@1234 for all.
 */
class TestUserSeeder extends Seeder
{
    public function run(): void
    {
        $pwd = Hash::make('Test@1234');

        $users = [
            ['email' => 'admin@admi.test',        'name' => 'Admin User',         'role' => 'admin'],
            ['email' => 'qa.manager@admi.test',   'name' => 'QA Manager',         'role' => 'qa_manager'],
            ['email' => 'qa.inspector@admi.test', 'name' => 'QA Inspector',       'role' => 'qa_inspector'],
            ['email' => 'shop.floor@admi.test',   'name' => 'Shop Floor',         'role' => 'shop_floor'],
            ['email' => 'viewer@admi.test',       'name' => 'Viewer',             'role' => 'viewer'],
        ];

        foreach ($users as $data) {
            $user = User::firstOrNew(['email' => $data['email']]);
            $user->name = $data['name'];
            $user->password = $pwd;
            $user->email_verified_at = $user->email_verified_at ?? now();
            $user->two_factor_secret = null;
            $user->two_factor_recovery_codes = null;
            $user->two_factor_confirmed_at = null;
            $user->save();
            $user->syncRoles([$data['role']]);
        }
    }
}
