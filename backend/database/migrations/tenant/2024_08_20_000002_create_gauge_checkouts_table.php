<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gauge checkout / check-in log per doc 3.11.
 *
 * Tracks who has each gauge at any moment. An open checkout has
 * checked_in_at = NULL. Business rule enforced in the service:
 * a gauge with an open checkout cannot be checked out again.
 *
 * job_reference is free-text (part number, work order, FAI number)
 * so the log answers "which job was this gauge on?" during an audit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gauge_checkouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gauge_id')->constrained('gauges')->cascadeOnDelete();
            $table->foreignId('checked_out_to')->constrained('users');
            $table->string('job_reference', 100)->nullable();
            $table->timestamp('checked_out_at')->useCurrent();
            $table->timestamp('checked_in_at')->nullable();
            $table->foreignId('checked_in_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();

            $table->index(['gauge_id', 'checked_in_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gauge_checkouts');
    }
};
