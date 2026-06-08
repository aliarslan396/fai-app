<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per doc Section 4.3.
 *
 * Tracks an inspector's progress through the 6-step workflow:
 *   1 = Part selected
 *   2 = Plan selected
 *   3 = Report type chosen (AS9102 / Custom) + manual fields
 *   4 = Measured actuals entered
 *   5 = Signed
 *   6 = Exported
 *
 * fai_id / custom_report_id point at the actual AS9102 or DEF-QA-003
 * record once Step 3 creates it (those tables come in Modules 4.4 / 4.5).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inspection_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('session_type', 20);
            // 'as9102' | 'custom' — picked at Step 3
            $table->foreignId('part_id')->constrained('parts')->cascadeOnDelete();
            $table->foreignId('inspection_plan_id')
                ->constrained('inspection_plans')
                ->cascadeOnDelete();

            // Filled when Step 3 creates the actual FAI / custom record (future modules)
            $table->unsignedBigInteger('fai_id')->nullable();
            $table->unsignedBigInteger('custom_report_id')->nullable();

            $table->unsignedTinyInteger('current_step')->default(1);
            $table->boolean('step1_complete')->default(false);
            $table->boolean('step2_complete')->default(false);
            $table->boolean('step3_complete')->default(false);
            $table->boolean('step4_complete')->default(false);
            $table->boolean('step5_complete')->default(false);
            $table->boolean('step6_complete')->default(false);

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['created_by', 'current_step']);
            $table->index(['part_id']);
            $table->index(['inspection_plan_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inspection_sessions');
    }
};
