<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 30-day soft-delete grace on tenants (Sprint 8 Day 2).
 *
 * A tenant "delete" from the master console flips it to status=cancelled,
 * stamps deleted_at now and purge_at now+30d, and revokes all tokens.
 * The DB itself stays around until the daily `tenants:purge` command
 * hard-drops it after purge_at passes. During the grace window, a super
 * admin can Restore the tenant — flipping status back to active and
 * clearing the two timestamps.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable()->index();
            $table->timestamp('purge_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn(['deleted_at', 'purge_at']);
        });
    }
};
