<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plan_characteristics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plan_id')->constrained('inspection_plans')->cascadeOnDelete();
            $table->unsignedInteger('balloon_number'); // bubble number on drawing
            $table->string('description'); // e.g. "Length 1.250 in"
            $table->string('characteristic_type', 30); // dimensional, gdt, visual, functional, material
            $table->string('classification', 30)->nullable(); // critical, major, minor, key

            // Tolerance config
            $table->string('tolerance_type', 20)->default('bilateral');
            // bilateral, plus_only, minus_only, min_only, max_only, basic, reference
            $table->decimal('nominal', 14, 6)->nullable();
            $table->decimal('upper_limit', 14, 6)->nullable();
            $table->decimal('lower_limit', 14, 6)->nullable();
            $table->string('unit', 20)->nullable(); // in, mm, deg, etc

            // For GD&T
            $table->string('gdt_symbol', 10)->nullable(); // ⌀, ∥, ⊥, etc
            $table->string('datum_references', 50)->nullable(); // -A-B-C-
            $table->decimal('gdt_tolerance', 14, 6)->nullable();

            // Measurement requirements
            $table->unsignedSmallInteger('sample_size')->default(1);
            $table->string('measurement_method', 100)->nullable(); // calipers, CMM, gauge, etc
            $table->foreignId('required_gauge_id')->nullable(); // FK added in Phase 4 (gauges)

            // Optional drawing link
            $table->foreignId('drawing_page_id')->nullable()->constrained('drawing_pages')->nullOnDelete();
            $table->decimal('bubble_x', 8, 2)->nullable(); // x position on page
            $table->decimal('bubble_y', 8, 2)->nullable();

            $table->text('notes')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['plan_id', 'balloon_number']);
            $table->index('characteristic_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plan_characteristics');
    }
};
