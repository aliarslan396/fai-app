<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tracks AI-generated balloon suggestions per doc Section 2.3.
 *
 * - drawing_balloons.source already supports 'manual' | 'ocr'; allow 'ai'.
 *   Postgres lets us insert any string since the column is plain varchar.
 * - confidence: 0.0 - 1.0 returned by the Ollama classifier
 * - source_text: original OCR text fragment that produced the suggestion
 * - accepted_at: timestamp when inspector confirmed the AI suggestion
 *   (NULL = still pending review)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('drawing_balloons', function (Blueprint $table) {
            $table->decimal('confidence', 3, 2)->nullable()->after('source');
            $table->text('source_text')->nullable()->after('confidence');
            $table->timestamp('accepted_at')->nullable()->after('source_text');
        });
    }

    public function down(): void
    {
        Schema::table('drawing_balloons', function (Blueprint $table) {
            $table->dropColumn(['confidence', 'source_text', 'accepted_at']);
        });
    }
};
