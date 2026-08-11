<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * NCR photo/document attachments per doc 3.10 / build prompt 4.7.
 *
 * Every NCR carries visual evidence — defect photos, cal certs, scrap
 * tags, rework proof, supplier RMAs, MRB decisions. This table is the
 * per-NCR file store, one row per attached file.
 *
 * Constraints applied at controller + service layer (not enforced by
 * DB) because Postgres check constraints on file counts require
 * subqueries that Laravel migrations don't cleanly express:
 *   - 10 attachments max per NCR
 *   - 10 MB max per file
 *   - jpg / png / pdf only
 *
 * Soft-deletes so the audit trail can prove "there WAS an attachment here"
 * even after cleanup; storage cleanup happens in the controller.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ncr_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ncr_id')->constrained('ncrs')->cascadeOnDelete();
            $table->string('original_filename', 255);
            $table->string('mime_type', 80);
            $table->unsignedInteger('size_bytes');
            $table->string('storage_path', 500);       // relative to storage/app disk
            $table->foreignId('uploaded_by')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index('ncr_id');
            $table->index('uploaded_by');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ncr_attachments');
    }
};
