<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mirrors the tenant-side password controls onto the central users table.
 *
 * The master super admin can provision, suspend and permanently purge
 * every tenant on the platform, so it is the single most privileged
 * credential in the product — and until now it had no rotation tracking,
 * no reuse history, and no way to change its password through the app at
 * all. A hardening pass that leaves the root account out is not one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('central_password_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('password_hash');
            $table->timestamp('created_at')->nullable();

            $table->index(['user_id', 'id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('password_changed_at')->nullable()->after('password');
        });

        // Existing accounts start their rotation clock from this deploy
        // rather than being immediately expired.
        \DB::table('users')->whereNull('password_changed_at')->update([
            'password_changed_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('password_changed_at');
        });
        Schema::dropIfExists('central_password_histories');
    }
};
