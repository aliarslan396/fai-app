<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sprint 2 — Full CAPA workflow (doc 3.10 + build prompt 4.7).
 *
 * Adds the columns the 5-tab UI needs on top of the Sprint 1 stub:
 *   - source: how the CAPA originated (ncr / audit / customer / internal)
 *   - containment_action: immediate action to stop bleeding before root cause is found
 *   - root_cause_summary: one-line summary written after the 5-Why is complete
 *   - approved_by / approved_at: multi-role sign-off snapshot (JSON = array of user ids + role + timestamp)
 *   - effectiveness_review_date: scheduled review date (typically +30 days after actions complete)
 *   - effectiveness_result / effectiveness_notes: outcome of that review
 *   - closed_by / closed_at: final closure audit trail
 *
 * All columns nullable so the Sprint 1 stub CAPAs continue to load.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('capas', function (Blueprint $table) {
            $table->string('source', 32)->default('ncr')->after('capa_number');
            $table->text('containment_action')->nullable()->after('problem_statement');
            $table->text('root_cause_summary')->nullable()->after('containment_action');

            $table->json('approved_by')->nullable()->after('root_cause_summary');
            $table->timestamp('approved_at')->nullable()->after('approved_by');

            $table->date('effectiveness_review_date')->nullable()->after('approved_at');
            $table->string('effectiveness_result', 32)->nullable()->after('effectiveness_review_date');
            $table->text('effectiveness_notes')->nullable()->after('effectiveness_result');

            $table->foreignId('closed_by')->nullable()->after('effectiveness_notes')->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable()->after('closed_by');
        });
    }

    public function down(): void
    {
        Schema::table('capas', function (Blueprint $table) {
            $table->dropForeign(['closed_by']);
            $table->dropColumn([
                'source',
                'containment_action',
                'root_cause_summary',
                'approved_by',
                'approved_at',
                'effectiveness_review_date',
                'effectiveness_result',
                'effectiveness_notes',
                'closed_by',
                'closed_at',
            ]);
        });
    }
};
