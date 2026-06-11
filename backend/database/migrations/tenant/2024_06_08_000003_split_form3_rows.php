<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Refactor: previous migration added Form 3 columns directly on
 * fai_characteristics which collides with the unique (plan_id, balloon_number)
 * index. The Plan-template characteristic and a specific FAI's measurement row
 * are different concepts and need separate tables.
 *
 * - fai_characteristics: stays as Plan template (no Form 3 columns)
 * - fai_form3_rows: per-FAI measurement rows referencing the template
 */
return new class extends Migration
{
    public function up(): void
    {
        // Pull the Form 3 fields back off fai_characteristics
        Schema::table('fai_characteristics', function (Blueprint $table) {
            $table->dropForeign(['fai_form1_id']);
            $table->dropColumn([
                'fai_form1_id',
                'field5_char_number',
                'field6_reference_location',
                'field7_char_designator',
                'field9_results',
                'field10_qualified_tooling',
                'field11_nonconformance_number',
                'field14_additional_comments',
                'pass_fail',
                'override_flag',
            ]);
        });

        // Dedicated Form 3 measurement table
        Schema::create('fai_form3_rows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fai_form1_id')->constrained('fai_form1')->cascadeOnDelete();
            $table->foreignId('characteristic_id')
                ->constrained('fai_characteristics')
                ->cascadeOnDelete();
            $table->unsignedInteger('balloon_number');

            // Form 3 fields per AS9102 Rev C
            $table->string('field5_char_number', 30)->nullable();
            $table->string('field6_reference_location', 100)->nullable();
            $table->string('field7_char_designator', 50)->nullable();
            $table->text('field8_requirement')->nullable();   // snapshot of requirement_string
            $table->text('field9_results')->nullable();
            $table->string('field10_qualified_tooling', 200)->nullable();
            $table->string('field11_nonconformance_number', 30)->nullable();
            $table->text('field14_additional_comments')->nullable();

            // Computed
            $table->string('pass_fail', 20)->default('not_measured');
            // pass | fail | not_measured | na

            // Override: inspector took over this row, don't auto-sync requirement
            $table->boolean('override_flag')->default(false);

            // Optional gauge link (Module 4.7 wires this)
            $table->unsignedBigInteger('gauge_id')->nullable();

            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['fai_form1_id', 'balloon_number'], 'fai_form3_row_unique');
            $table->index(['fai_form1_id', 'pass_fail']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fai_form3_rows');

        Schema::table('fai_characteristics', function (Blueprint $table) {
            $table->foreignId('fai_form1_id')->nullable()
                ->after('plan_id')
                ->constrained('fai_form1')->nullOnDelete();
            $table->string('field5_char_number', 30)->nullable()->after('requirement_string');
            $table->string('field6_reference_location', 100)->nullable()->after('field5_char_number');
            $table->string('field7_char_designator', 50)->nullable()->after('field6_reference_location');
            $table->text('field9_results')->nullable()->after('field7_char_designator');
            $table->string('field10_qualified_tooling', 200)->nullable()->after('field9_results');
            $table->string('field11_nonconformance_number', 30)->nullable()->after('field10_qualified_tooling');
            $table->text('field14_additional_comments')->nullable()->after('field11_nonconformance_number');
            $table->string('pass_fail', 20)->nullable()->after('field14_additional_comments');
            $table->boolean('override_flag')->default(false)->after('pass_fail');
        });
    }
};
