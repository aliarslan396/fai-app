<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * AI feedback loop (Sprint 7 · Timothy Aug 26 request "AI that gets
 * better over time"). Every user correction to an AI-detected balloon
 * lands here — the raw training data we hand to the AI team (or a
 * prompt-tuning session) to lift accuracy over months.
 *
 * Sources of a correction:
 *   - `reposition` — user dragged an OCR balloon to a new spot
 *   - `reject` — user deleted an OCR balloon entirely
 *   - `relabel` — user changed the char_type on an OCR balloon
 *
 * balloon_id is nullable because a rejected balloon may have been hard-
 * deleted; the original AI guess (coords + type) is snapshotted below
 * so the correction is still useful without the parent row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_corrections', function (Blueprint $table) {
            $table->id();

            $table->foreignId('plan_id')->constrained('inspection_plans')->cascadeOnDelete();
            $table->foreignId('balloon_id')->nullable()->constrained('drawing_balloons')->nullOnDelete();
            $table->foreignId('drawing_id')->constrained('drawings')->cascadeOnDelete();
            $table->unsignedSmallInteger('page_number');

            // Correction kind + AI guess snapshot (immutable)
            $table->string('correction_type', 20); // reposition | reject | relabel
            $table->decimal('original_x_pct', 6, 3)->nullable();
            $table->decimal('original_y_pct', 6, 3)->nullable();
            $table->string('original_char_type', 30)->nullable();
            $table->text('original_ocr_text')->nullable(); // What OCR thought the label said

            // What the user changed it to
            $table->decimal('corrected_x_pct', 6, 3)->nullable();
            $table->decimal('corrected_y_pct', 6, 3)->nullable();
            $table->string('corrected_char_type', 30)->nullable();
            $table->text('user_notes')->nullable();

            $table->foreignId('user_id')->constrained('users');
            $table->timestamps();

            $table->index(['plan_id', 'correction_type']);
            $table->index('created_at');
            $table->index('drawing_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_corrections');
    }
};
