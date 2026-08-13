<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * CAPA (Corrective And Preventive Action) — root cause investigation
 * per doc 3.10 / build prompt 4.7.
 *
 * This migration lands the STUB scope only:
 *   - capa_number (CAPA-YYYY-NNNN, atomic sequence)
 *   - link back to originating NCR
 *   - basic problem statement + defect code
 *   - status enum for the workflow
 *
 * Full 5-tab UI (Problem / 5-Why / Action Plan / Approval /
 * Effectiveness) lands in Sprint 2. The stub is enough for the
 * "Escalate to CAPA" button to work end-to-end, and for auditors
 * to trace NCR ↔ CAPA linkage.
 *
 * The ncrs.capa_id column already exists from the Aug 10 enhanced
 * fields migration; the FK is added here now that the target table
 * exists.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('capas', function (Blueprint $table) {
            $table->id();
            $table->string('capa_number', 32)->unique();

            // Origin — where the CAPA was triggered from. NCR is the most
            // common source (via Escalate button); manual/audit/customer
            // paths land later.
            $table->foreignId('source_ncr_id')->nullable()->constrained('ncrs')->nullOnDelete();

            // Snapshot copied from NCR at escalation time so future NCR
            // edits don't rewrite the CAPA context.
            $table->foreignId('part_id')->nullable()->constrained('parts')->nullOnDelete();
            $table->string('defect_code', 50)->nullable();
            $table->text('problem_statement')->nullable();

            // Workflow status. Full state machine + tab-gated transitions
            // land with the Sprint 2 UI; stub allows all values.
            $table->string('status', 40)->default('open')->index();

            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();
            $table->softDeletes();

            $table->index('source_ncr_id');
            $table->index('part_id');
        });

        // Now the target table exists — attach the FK on ncrs.capa_id
        // (column was added by the Aug 10 enhanced-fields migration).
        Schema::table('ncrs', function (Blueprint $table) {
            $table->foreign('capa_id')->references('id')->on('capas')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('ncrs', function (Blueprint $table) {
            $table->dropForeign(['capa_id']);
        });
        Schema::dropIfExists('capas');
    }
};
