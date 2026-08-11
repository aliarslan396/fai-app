<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two-sign-off close-out per doc 3.10:
 *
 *   "Close-out requires two separate sign-offs."
 *
 * Aerospace anti-fraud rule — one person can't file + fix + close an
 * NCR without QA oversight. Two accountable signatures required:
 *
 *   verified_by / verified_at / verification_notes
 *       Shop lead or inspector confirms corrective action performed.
 *
 *   closed_by / closed_at / closure_notes  (already existed)
 *       QA Manager confirms verification is valid and closes NCR.
 *
 * The NcrService::close() method enforces closed_by !== verified_by
 * (different humans required). Migration is additive — nulls
 * everywhere; old dispositioned NCRs land in the new verification
 * gate but can still be closed by whichever workflow the user follows.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ncrs', function (Blueprint $table) {
            $table->foreignId('verified_by')->nullable()->after('dispositioned_at')->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable()->after('verified_by');
            $table->text('verification_notes')->nullable()->after('verified_at');
        });
    }

    public function down(): void
    {
        Schema::table('ncrs', function (Blueprint $table) {
            $table->dropForeign(['verified_by']);
            $table->dropColumn(['verified_by', 'verified_at', 'verification_notes']);
        });
    }
};
