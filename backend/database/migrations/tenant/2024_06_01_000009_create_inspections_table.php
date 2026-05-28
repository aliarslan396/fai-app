<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inspections', function (Blueprint $table) {
            $table->id();
            $table->string('inspection_number')->unique(); // INS-2026-0001
            $table->foreignId('plan_id')->constrained('inspection_plans')->restrictOnDelete();
            $table->foreignId('part_id')->constrained('parts')->restrictOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();

            // Lot/batch info
            $table->string('lot_number', 100)->nullable();
            $table->string('serial_number', 100)->nullable();
            $table->string('po_number', 100)->nullable();
            $table->unsignedInteger('quantity_inspected')->default(1);
            $table->unsignedInteger('quantity_received')->nullable();

            $table->string('type', 30)->default('fai'); // fai, in_process, final, receiving
            $table->string('status', 30)->default('draft')->index();
            // draft, in_progress, awaiting_review, approved, rejected, rework

            // Result summary
            $table->string('result', 20)->nullable(); // pass, fail, conditional
            $table->unsignedInteger('total_characteristics')->default(0);
            $table->unsignedInteger('passed_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);

            // People
            $table->foreignId('inspector_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reviewer_id')->nullable()->constrained('users')->nullOnDelete();

            // Sign-off
            $table->timestamp('inspector_signed_at')->nullable();
            $table->string('inspector_signature_ip', 45)->nullable();
            $table->timestamp('reviewer_signed_at')->nullable();
            $table->string('reviewer_signature_ip', 45)->nullable();
            $table->text('reviewer_notes')->nullable();
            $table->text('rejection_reason')->nullable();

            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['part_id', 'status']);
            $table->index('lot_number');
            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inspections');
    }
};
