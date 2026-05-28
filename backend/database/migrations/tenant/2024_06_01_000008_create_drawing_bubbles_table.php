<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('drawing_bubbles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('drawing_page_id')->constrained('drawing_pages')->cascadeOnDelete();
            $table->foreignId('characteristic_id')->nullable()->constrained('plan_characteristics')->nullOnDelete();
            $table->unsignedInteger('bubble_number');
            $table->decimal('x', 8, 2);
            $table->decimal('y', 8, 2);
            $table->decimal('radius', 6, 2)->default(15);
            $table->string('source', 20)->default('manual'); // manual, ai_auto, ai_semi
            $table->decimal('ai_confidence', 4, 3)->nullable(); // 0.000 - 1.000
            $table->json('ai_metadata')->nullable(); // raw AI response for this bubble
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['drawing_page_id', 'bubble_number']);
            $table->index('characteristic_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('drawing_bubbles');
    }
};
