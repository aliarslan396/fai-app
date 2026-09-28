<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Password history + rotation tracking (21 CFR Part 11 §11.300(b), which
 * requires that identification code / password issuances be periodically
 * checked, recalled or revised).
 *
 * Only the bcrypt hash is stored — never the password — so the table is
 * no more sensitive than the users table it mirrors, and a reuse check
 * is a Hash::check against each recent entry.
 *
 * password_changed_at drives forced rotation for privileged roles. It is
 * backfilled to now() for existing users rather than left null, so a
 * deploy does not immediately lock every admin out of their own tenant.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('password_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('password_hash');
            $table->timestamp('created_at')->nullable();

            $table->index(['user_id', 'id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('password_changed_at')->nullable()->after('password');
        });

        // Existing accounts start their rotation clock from this deploy.
        \DB::table('users')->whereNull('password_changed_at')->update([
            'password_changed_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('password_changed_at');
        });
        Schema::dropIfExists('password_histories');
    }
};
