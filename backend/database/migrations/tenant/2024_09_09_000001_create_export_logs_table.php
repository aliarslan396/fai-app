<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Export audit trail per doc §5.6.12 — every download of an FAI Excel /
 * FAI PDF / Custom Report PDF writes a row here so auditors can answer
 * "who downloaded FAI X on date Y" and the shop can trace which version
 * of a signed FAI was actually shipped to the customer.
 *
 * Records are immutable (no update/delete pattern in the service) and
 * indexed for the two hot queries: recent activity + per-subject history.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('export_logs', function (Blueprint $table) {
            $table->id();
            // Polymorphic ref to FaiForm1 or CustomInspectionReport
            $table->string('subject_type', 60);
            $table->unsignedBigInteger('subject_id');
            $table->string('format', 20); // excel | pdf
            $table->string('file_name', 200);
            $table->unsignedInteger('file_size_bytes')->nullable();
            $table->foreignId('exported_by')->constrained('users');
            $table->string('exported_by_name', 120)->nullable(); // snapshot for immutability
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->timestamp('exported_at')->useCurrent();
            $table->timestamps();

            $table->index(['subject_type', 'subject_id']);
            $table->index('exported_at');
            $table->index('exported_by');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('export_logs');
    }
};
