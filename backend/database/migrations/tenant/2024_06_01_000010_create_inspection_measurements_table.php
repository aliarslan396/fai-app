<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inspection_measurements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inspection_id')->constrained('inspections')->cascadeOnDelete();
            $table->foreignId('characteristic_id')->constrained('plan_characteristics')->restrictOnDelete();
            $table->unsignedSmallInteger('sample_index')->default(1); // which sample (1..n)

            $table->decimal('measured_value', 14, 6)->nullable();
            $table->string('measured_text', 100)->nullable(); // for visual/non-numeric
            $table->string('result', 20)->nullable(); // pass, fail, na
            $table->boolean('is_oot')->default(false); // out-of-tolerance flag
            $table->decimal('deviation', 14, 6)->nullable(); // measured - nominal

            $table->foreignId('gauge_id')->nullable(); // FK added in Phase 4
            $table->string('measurement_method', 100)->nullable();
            $table->json('photos')->nullable(); // array of photo paths
            $table->text('notes')->nullable();

            $table->foreignId('measured_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('measured_at')->nullable();
            $table->timestamps();

            $table->unique(['inspection_id', 'characteristic_id', 'sample_index'], 'inspection_char_sample_unique');
            $table->index(['inspection_id', 'result']);
            $table->index('is_oot');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inspection_measurements');
    }
};
