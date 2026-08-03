<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gauge master + calibration history per doc Section 3.11.
 *
 * gauges:
 *   Central register of every measurement tool on the shop floor.
 *   Status is DERIVED at read time from next_cal_due:
 *     current (>14 days remaining) / due (within 14 days) / overdue / out_of_service
 *
 * gauge_calibrations:
 *   Full calibration history for each gauge — as_found + as_left readings,
 *   cert PDF upload, technician, next-due computed from interval.
 *   OOT (out-of-tolerance) failed cals can escalate to NCRs via source pointer
 *   (wired in Phase 3 alongside NCR-CAPA link work).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gauges', function (Blueprint $table) {
            $table->id();

            // Identity
            $table->string('gauge_id', 60)->unique();       // shop-assigned unique tag (e.g. CAL-047, MIC-A12)
            $table->string('type', 60);                     // caliper, micrometer, cmm, indicator, thread gage, gauge block set...
            $table->string('manufacturer', 100)->nullable();
            $table->string('model', 100)->nullable();
            $table->string('serial_number', 100)->nullable();

            // Range + resolution — free text so we can capture "0-6 in" or "0-150mm" naturally
            $table->string('range', 60)->nullable();        // e.g. "0-6 in" or "0-150 mm"
            $table->string('resolution', 60)->nullable();   // e.g. "0.0005 in" or "0.01 mm"

            // Physical location + custody
            $table->string('location', 100)->nullable();    // e.g. "QA Lab", "Cell #3", "Machinist Bob"

            // Calibration schedule
            $table->integer('calibration_interval_months')->default(12);
            $table->date('last_calibrated_at')->nullable();
            $table->date('next_cal_due')->nullable();       // computed = last + interval; kept in row for fast queries

            // Manual override — pulls gauge out of service regardless of cal status
            $table->boolean('out_of_service')->default(false);
            $table->text('out_of_service_reason')->nullable();

            // Audit
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();
            $table->softDeletes();

            $table->index('next_cal_due');
            $table->index('type');
            $table->index('out_of_service');
        });

        Schema::create('gauge_calibrations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gauge_id')->constrained('gauges')->cascadeOnDelete();

            // Actor + timing
            $table->date('calibrated_at');
            $table->string('calibrated_by', 100);            // tech / vendor name
            $table->string('cert_number', 100)->nullable();
            $table->string('cert_file_path')->nullable();    // PDF upload — private disk

            // Readings — free text to allow multi-point cal notes
            $table->text('as_found')->nullable();
            $table->text('as_left')->nullable();

            // Outcome
            $table->enum('result', ['pass', 'fail_oot', 'limited_use'])->default('pass');
            $table->text('notes')->nullable();

            // Escalation link to NCR if OOT (populated Phase 3)
            $table->foreignId('ncr_id')->nullable()->constrained('ncrs')->nullOnDelete();

            // Audit
            $table->foreignId('recorded_by')->constrained('users');
            $table->timestamps();

            $table->index(['gauge_id', 'calibrated_at']);
            $table->index('result');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gauge_calibrations');
        Schema::dropIfExists('gauges');
    }
};
