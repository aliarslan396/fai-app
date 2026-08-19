<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 5-Why root-cause chain for a CAPA.
 *
 * One row per level (1..5). Progressive lock enforced in service —
 * level N can only be saved if level N-1 exists. Each level captures
 * one "why" answer that led to the deeper level.
 *
 * (capa_id, level) is unique so a CAPA has at most one row per level.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('capa_five_whys', function (Blueprint $table) {
            $table->id();
            $table->foreignId('capa_id')->constrained('capas')->cascadeOnDelete();
            $table->unsignedTinyInteger('level');
            $table->text('why_text');
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();

            $table->unique(['capa_id', 'level']);
            $table->index('capa_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('capa_five_whys');
    }
};
