<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Polymorphic signatures table — one row per signature event on any
 * signable form (FaiForm1, FaiForm3Row, CustomInspectionReport).
 *
 * Aerospace audit requires non-repudiation: who signed what when from
 * where, with proof of password re-verification.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('signatures', function (Blueprint $table) {
            $table->id();
            $table->string('signable_type');                 // App\Models\FaiForm1 etc.
            $table->unsignedBigInteger('signable_id');
            $table->string('signature_role', 50);            // inspector | qa_manager | customer_rep
            $table->foreignId('signed_by')->constrained('users');
            $table->timestamp('signed_at');
            $table->string('signature_image_path');          // canvas PNG saved to storage
            $table->string('stamp_image_path')->nullable();  // auto-generated stamp PNG
            $table->string('ip_address', 45);                // IPv4 or IPv6
            $table->text('user_agent');
            $table->timestamp('password_verified_at');       // proof of re-verify before sign
            $table->timestamps();

            $table->index(['signable_type', 'signable_id']);
            $table->index('signed_by');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('signatures');
    }
};
