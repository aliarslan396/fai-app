<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One-time data migration: any FAI form that's already locked
 * (signed BEFORE the status lifecycle deploy) should have its status
 * set to `accepted`. Without this, historical forms show a stale
 * "In Work" badge + Submit button on a locked form (inconsistent state).
 *
 * Idempotent — only touches rows where locked=true and status != accepted.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('fai_form1')
            ->where('locked', true)
            ->where('status', '!=', 'accepted')
            ->update(['status' => 'accepted']);
    }

    public function down(): void
    {
        // No-op — reverting would require knowing original status per row.
    }
};
