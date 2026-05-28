<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('drawings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('part_id')->constrained('parts')->cascadeOnDelete();
            $table->string('original_filename');
            $table->string('file_path'); // Storage path
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('file_size'); // bytes
            $table->string('drawing_number', 100)->nullable();
            $table->string('revision', 20)->nullable();
            $table->unsignedSmallInteger('page_count')->default(1);
            $table->string('status', 30)->default('uploaded')->index();
            // uploaded -> processing -> processed -> bubbled -> failed
            $table->text('processing_error')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index('part_id');
            $table->index('drawing_number');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('drawings');
    }
};
