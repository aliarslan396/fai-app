<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lock columns on signable forms. Once locked_at is set, no edits
 * allowed via controllers/services. Enforced at backend layer for
 * audit-grade tamper protection.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fai_form1', function (Blueprint $table) {
            $table->timestamp('locked_at')->nullable()->after('updated_at');
            $table->foreignId('locked_by')->nullable()->after('locked_at')
                ->constrained('users')->nullOnDelete();
        });

        Schema::table('custom_inspection_reports', function (Blueprint $table) {
            // Add column only if not already present (older migration may
            // have added a "locked" boolean flag).
            if (! Schema::hasColumn('custom_inspection_reports', 'locked_at')) {
                $table->timestamp('locked_at')->nullable()->after('updated_at');
            }
            if (! Schema::hasColumn('custom_inspection_reports', 'locked_by')) {
                $table->foreignId('locked_by')->nullable()->after('locked_at')
                    ->constrained('users')->nullOnDelete();
            }
        });

        // fai_form3_rows: row-level lock unnecessary — locking is at the
        // parent FaiForm1. Skip here.
    }

    public function down(): void
    {
        Schema::table('fai_form1', function (Blueprint $table) {
            $table->dropForeign(['locked_by']);
            $table->dropColumn(['locked_at', 'locked_by']);
        });

        Schema::table('custom_inspection_reports', function (Blueprint $table) {
            if (Schema::hasColumn('custom_inspection_reports', 'locked_by')) {
                $table->dropForeign(['locked_by']);
                $table->dropColumn('locked_by');
            }
            if (Schema::hasColumn('custom_inspection_reports', 'locked_at')) {
                $table->dropColumn('locked_at');
            }
        });
    }
};
