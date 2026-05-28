<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inspection_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('part_id')->constrained('parts')->cascadeOnDelete();
            $table->foreignId('drawing_id')->nullable()->constrained('drawings')->nullOnDelete();
            $table->string('name'); // e.g. "FAI Plan Rev A"
            $table->string('version', 20)->default('1');
            $table->text('description')->nullable();
            $table->string('inspection_type', 30)->default('fai'); // fai, in_process, final, receiving
            $table->string('status', 20)->default('draft')->index(); // draft, active, archived
            $table->foreignId('parent_plan_id')->nullable()->constrained('inspection_plans')->nullOnDelete(); // for clones
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['part_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inspection_plans');
    }
};
