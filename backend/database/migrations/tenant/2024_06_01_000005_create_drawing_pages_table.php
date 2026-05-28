<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('drawing_pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('drawing_id')->constrained('drawings')->cascadeOnDelete();
            $table->unsignedSmallInteger('page_number');
            $table->string('image_path'); // Rendered page as PNG
            $table->string('thumbnail_path')->nullable();
            $table->unsignedInteger('width');
            $table->unsignedInteger('height');
            $table->json('ocr_text')->nullable(); // Extracted text + bboxes
            $table->json('ai_analysis')->nullable(); // GPT-4V raw response
            $table->timestamp('ocr_completed_at')->nullable();
            $table->timestamp('ai_completed_at')->nullable();
            $table->timestamps();

            $table->unique(['drawing_id', 'page_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('drawing_pages');
    }
};
