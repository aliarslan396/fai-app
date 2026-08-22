<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * OOT (Out-Of-Tolerance) impact assessments per doc 3.11.
 *
 * When a gauge fails its calibration, an assessment must be logged
 * covering: what was measured with the bad gauge since the last known
 * good cal, what the risk to product is, and whether NCRs need to be
 * filed for the affected work.
 *
 * One assessment per failing calibration event (assessment ↔ calibration
 * is 1:1). The optional NCR linkage lets an inspector pull the trigger
 * on suspect-part quarantine straight from this row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gauge_oot_assessments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gauge_id')->constrained('gauges')->cascadeOnDelete();
            $table->foreignId('calibration_id')->unique()->constrained('gauge_calibrations')->cascadeOnDelete();

            // Window of exposure — what did this gauge measure since last good cal?
            $table->date('last_known_good_at')->nullable();
            $table->text('parts_at_risk_summary')->nullable();
            $table->text('impact_analysis');
            $table->text('containment_action')->nullable();

            // Optional NCR opened for the suspect parts. NCR module handles
            // the actual quarantine + disposition; we just record the link.
            $table->foreignId('ncr_id')->nullable()->constrained('ncrs')->nullOnDelete();

            $table->string('disposition', 40);
            $table->foreignId('assessed_by')->constrained('users');
            $table->timestamp('assessed_at')->useCurrent();
            $table->timestamps();

            $table->index('gauge_id');
            $table->index('ncr_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gauge_oot_assessments');
    }
};
