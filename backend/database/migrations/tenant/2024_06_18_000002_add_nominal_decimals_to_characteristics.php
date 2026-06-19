<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fai_characteristics', function (Blueprint $table) {
            // Preserve typed decimal precision for block-tolerance bucket selection.
            // decimal:6 cast drops trailing zeros, so "1.500" -> "1.500000" loses
            // the typed "3 decimals" signal. Frontend sets this from user input.
            $table->unsignedTinyInteger('nominal_decimals')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('fai_characteristics', function (Blueprint $table) {
            $table->dropColumn('nominal_decimals');
        });
    }
};
