<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Module 4.4 — AS9102 Forms 1/2/3 + Requirement Pipeline.
 *
 * Tables per doc Section 4.4:
 *   - fai_form1: 26 fields per AS9102 Rev C Form 1 (Design Documentation)
 *   - fai_form2: 13 fields per Form 2 (Product Accountability)
 *   - fai_form2_materials: materials sub-rows (fields 5-10 of Form 2)
 *   - fai_form1_index: Assembly Index (fields 15-18, shown when Detail=Assembly)
 *
 * Form 3 is just additional columns on the existing fai_characteristics table:
 *   - field5_char_number, field6_reference_location, field7_char_designator,
 *     field8_requirement, field9_results, field10_qualified_tooling,
 *     field11_nonconformance_number, field14_additional_comments,
 *     plus computed pass_fail + override_flag
 */
return new class extends Migration
{
    public function up(): void
    {
        // ============================================================
        // FORM 1 — Design Documentation
        // ============================================================
        Schema::create('fai_form1', function (Blueprint $table) {
            $table->id();
            $table->string('fai_number', 30)->unique();
            // Inspection session anchor
            $table->foreignId('inspection_session_id')
                ->constrained('inspection_sessions')
                ->cascadeOnDelete();
            $table->foreignId('part_id')->constrained('parts');
            $table->foreignId('inspection_plan_id')->constrained('inspection_plans');

            // Fields 1-8 (header, mostly auto-filled)
            $table->string('field1_part_number', 100)->nullable();
            $table->string('field2_part_name', 200)->nullable();
            $table->string('field3_serial_number', 100)->nullable();
            $table->string('field4_fair_identifier', 100)->nullable();
            $table->string('field5_part_revision', 20)->nullable();
            $table->string('field6_drawing_number', 100)->nullable();
            $table->string('field7_drawing_revision', 20)->nullable();
            $table->text('field8_additional_changes')->nullable();

            // Fields 9-12 (manual)
            $table->string('field9_mfg_process_ref', 200)->nullable();
            $table->string('field10_org_name', 200)->nullable();
            $table->string('field11_supplier_code', 100)->nullable();
            $table->string('field12_po_number', 100)->nullable();

            // Field 13: Detail or Assembly (radio)
            $table->string('field13_detail_or_assembly', 20)->default('detail');
            // detail | assembly

            // Field 14: Full or Partial FAI
            $table->string('field14_fai_type', 20)->default('full');
            // full | partial
            $table->string('field14_baseline_part_number', 100)->nullable();
            $table->text('field14_partial_reason')->nullable();

            // Field 19: Has Nonconformance? (Yes/No)
            $table->boolean('field19_has_nonconformance')->default(false);

            // Fields 20-25: Three signature rows
            $table->string('field20_verified_by_name', 200)->nullable();
            $table->timestamp('field21_verified_at')->nullable();
            $table->string('field22_reviewed_by_name', 200)->nullable();
            $table->timestamp('field23_reviewed_at')->nullable();
            $table->string('field24_customer_approval_name', 200)->nullable();
            $table->timestamp('field25_customer_approval_at')->nullable();

            // Field 26: Comments
            $table->text('field26_comments')->nullable();

            // Workflow status per doc 3.4
            $table->string('status', 30)->default('in_work');
            // in_work | submitted | returned | accepted
            $table->text('returned_reason')->nullable();

            // Lock state (auto when status = accepted)
            $table->boolean('locked')->default(false);

            // Storage paths for signatures + stamp (Module 4.6)
            $table->string('signature_path', 500)->nullable();
            $table->string('stamp_path', 500)->nullable();

            $table->timestamps();
            $table->softDeletes();
        });

        // ============================================================
        // FORM 1 INDEX — Assembly Index (fields 15-18, multiple rows)
        // ============================================================
        Schema::create('fai_form1_index', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fai_form1_id')->constrained('fai_form1')->cascadeOnDelete();
            $table->string('field15_part_number', 100);
            $table->string('field16_part_name', 200)->nullable();
            $table->string('field17_part_type', 50)->nullable();
            // raw | sub | assembly | finish
            $table->string('field18_fair_identifier', 100)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // ============================================================
        // FORM 2 — Product Accountability
        // ============================================================
        Schema::create('fai_form2', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fai_form1_id')->unique()->constrained('fai_form1')->cascadeOnDelete();

            // Fields 1-4 (auto-populated read-only from Form 1)
            $table->string('field1_part_number', 100)->nullable();
            $table->string('field2_part_name', 200)->nullable();
            $table->string('field3_serial_number', 100)->nullable();
            $table->string('field4_fair_identifier', 100)->nullable();

            // Fields 11-12 (functional testing)
            $table->string('field11_functional_test_procedure', 200)->nullable();
            $table->string('field12_acceptance_report_number', 200)->nullable();

            // Field 13
            $table->text('field13_comments')->nullable();

            $table->timestamps();
        });

        // ============================================================
        // FORM 2 MATERIALS — fields 5-10, multiple rows per Form 2
        // ============================================================
        Schema::create('fai_form2_materials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fai_form2_id')->constrained('fai_form2')->cascadeOnDelete();
            $table->string('field5_material_name', 200)->nullable();
            $table->string('field6_spec_number', 100)->nullable();
            $table->string('field7_code', 100)->nullable();
            $table->string('field8_supplier', 200)->nullable();
            $table->string('field9_customer_approval', 10)->nullable();
            // yes | no | na
            $table->string('field10_coc_number', 100)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // ============================================================
        // FORM 3 — Add measurement columns to fai_characteristics
        // ============================================================
        Schema::table('fai_characteristics', function (Blueprint $table) {
            // Form 3 columns per doc 4.4
            $table->foreignId('fai_form1_id')->nullable()
                ->after('plan_id')
                ->constrained('fai_form1')->nullOnDelete();
            $table->string('field5_char_number', 30)->nullable()->after('requirement_string');
            $table->string('field6_reference_location', 100)->nullable()->after('field5_char_number');
            $table->string('field7_char_designator', 50)->nullable()->after('field6_reference_location');
            // field8_requirement = same as requirement_string (kept for AS9102 column naming)
            $table->text('field9_results')->nullable()->after('field7_char_designator');
            $table->string('field10_qualified_tooling', 200)->nullable()->after('field9_results');
            $table->string('field11_nonconformance_number', 30)->nullable()->after('field10_qualified_tooling');
            $table->text('field14_additional_comments')->nullable()->after('field11_nonconformance_number');

            // Computed pass/fail per row
            $table->string('pass_fail', 20)->nullable()->after('field14_additional_comments');
            // pass | fail | not_measured

            // Override toggle — when set, sync engine skips this row
            $table->boolean('override_flag')->default(false)->after('pass_fail');

            $table->index('fai_form1_id');
            $table->index('pass_fail');
        });
    }

    public function down(): void
    {
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

        Schema::dropIfExists('fai_form2_materials');
        Schema::dropIfExists('fai_form2');
        Schema::dropIfExists('fai_form1_index');
        Schema::dropIfExists('fai_form1');
    }
};
