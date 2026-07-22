<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Non-Conformance Report — one row per failed characteristic that needs
 * disposition (rework / scrap / use-as-is / return-to-vendor).
 *
 * Aerospace / AS9100 compliance: every failure must be logged, dispositioned
 * by QA Manager, and linked to the failing characteristic on Form 3 or the
 * Custom Report. Auto-numbered NCR-YYYY-NNNN, same pattern as FAI number.
 *
 * `source_type` + `source_id` are a lightweight polymorphic pointer back to
 * the failing row (FaiForm3Row / CustomReportCharacteristic) so we can trace
 * the NCR back to its trigger even if the form is later re-sync'd.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ncrs', function (Blueprint $table) {
            $table->id();

            // Auto-generated identifier NCR-YYYY-NNNN — surfaced on all forms + exports
            $table->string('ncr_number', 32)->unique();

            // Optional links — an NCR can exist standalone (walk-in defect w/ no plan yet)
            $table->foreignId('part_id')->nullable()->constrained('parts')->nullOnDelete();
            $table->foreignId('inspection_session_id')->nullable()->constrained('inspection_sessions')->nullOnDelete();

            // Polymorphic source pointer — the row that failed and triggered this NCR
            $table->string('source_type')->nullable(); // App\Models\FaiForm3Row | CustomReportCharacteristic
            $table->unsignedBigInteger('source_id')->nullable();

            // Snapshot of the failure — copied at creation time so re-sync doesn't blank it
            $table->string('characteristic_ref', 60)->nullable();      // char # or balloon #
            $table->text('requirement')->nullable();                    // "Ø.2500 +.0050/-.0000 in"
            $table->string('actual_result', 60)->nullable();            // "0.2503"
            $table->string('unit', 20)->nullable();                     // "in", "mm"

            // Aerospace defect classification
            $table->enum('severity', ['minor', 'major', 'critical'])->default('major');
            $table->text('cause')->nullable();                          // root-cause narrative

            // Disposition — QA Manager decides how to handle
            $table->enum('disposition', [
                'pending',
                'rework',
                'scrap',
                'use_as_is',
                'return_to_vendor',
                'no_defect_found',
            ])->default('pending');
            $table->text('disposition_notes')->nullable();

            // Workflow status
            $table->enum('status', ['open', 'dispositioned', 'closed'])->default('open');
            $table->text('closure_notes')->nullable();

            // Actor + timeline
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('dispositioned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('dispositioned_at')->nullable();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['source_type', 'source_id']);
            $table->index('part_id');
            $table->index('inspection_session_id');
            $table->index('status');
            $table->index('disposition');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ncrs');
    }
};
