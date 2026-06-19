<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inspection_plans', function (Blueprint $table) {
            // Block tolerance from drawing's "unless otherwise specified" box.
            // Industry standard pre-fills; inspector overrides per drawing.
            $table->decimal('tol_1dp', 8, 5)->default(0.030);   // .X    rule
            $table->decimal('tol_2dp', 8, 5)->default(0.010);   // .XX   rule
            $table->decimal('tol_3dp', 8, 5)->default(0.005);   // .XXX  rule
            $table->decimal('tol_angular', 8, 5)->default(0.5); // angle rule (degrees)
        });

        Schema::table('fai_characteristics', function (Blueprint $table) {
            // When true, tolerance pulled from plan defaults by decimal-place detection.
            // When false, upper_tolerance/lower_tolerance on this row used directly.
            $table->boolean('use_default_tolerance')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('inspection_plans', function (Blueprint $table) {
            $table->dropColumn(['tol_1dp', 'tol_2dp', 'tol_3dp', 'tol_angular']);
        });

        Schema::table('fai_characteristics', function (Blueprint $table) {
            $table->dropColumn('use_default_tolerance');
        });
    }
};
