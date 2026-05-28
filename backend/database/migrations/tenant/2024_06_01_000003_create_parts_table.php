<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('parts', function (Blueprint $table) {
            $table->id();
            $table->string('part_number', 100);
            $table->string('revision', 20)->default('A');
            $table->string('description');
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('material', 100)->nullable();
            $table->string('process', 100)->nullable(); // CNC, casting, sheet metal, etc
            $table->decimal('weight', 10, 4)->nullable();
            $table->string('weight_unit', 10)->default('g');
            $table->string('classification', 50)->nullable(); // critical, major, minor
            $table->string('status', 20)->default('active')->index(); // active, obsolete, hold
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['part_number', 'revision']);
            $table->index('part_number');
            $table->index('description');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('parts');
    }
};
