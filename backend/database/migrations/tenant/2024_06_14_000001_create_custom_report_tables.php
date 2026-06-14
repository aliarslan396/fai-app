<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Module 4.5 — DEF-QA-003 Custom Inspection Report.
 *
 * Doc Section 4.5 spec:
 *  - custom_report_templates: seeded with DEF-QA-003; future formats added here
 *  - custom_inspection_reports: per-FAI/per-batch report header (1-page layout)
 *  - custom_report_characteristics: 20 pre-numbered rows per report
 *
 * Also flags parts whose first-article (AS9102) has been approved so the
 * workflow can recommend Custom over AS9102 for repeat production runs.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ============================================================
        // CUSTOM REPORT TEMPLATES
        // ============================================================
        Schema::create('custom_report_templates', function (Blueprint $table) {
            $table->id();
            $table->string('template_code', 50)->unique();
            $table->string('header_title', 200);
            $table->string('doc_number', 50);
            $table->string('revision', 20)->default('0');
            $table->string('default_tolerances', 200)->nullable();
            $table->unsignedSmallInteger('max_characteristic_rows')->default(20);
            $table->text('signature_statement')->nullable();
            $table->json('columns_config')->nullable();
            $table->string('primary_color', 20)->default('#1F4E79');
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        // Seed the canonical DEF-QA-003 template per doc Section 4.5
        DB::table('custom_report_templates')->insert([
            'template_code' => 'DEF-QA-003',
            'header_title' => 'INSPECTION REPORT',
            'doc_number' => 'DEF-QA-003',
            'revision' => '0',
            'default_tolerances' => '.XXX = ±.010  .XX = ±.030  .X = ±.100',
            'max_characteristic_rows' => 20,
            'signature_statement' => 'The signature indicates that all characteristics are accounted for; meet drawing requirements or are properly documented for disposition.',
            'columns_config' => json_encode([
                ['key' => 'field5_char_number',         'label' => '5. Char No.',                'width_pct' => 5],
                ['key' => 'field6_reference_location', 'label' => '6. Reference Location',     'width_pct' => 9],
                ['key' => 'field7_char_designator',    'label' => '7. Characteristic Designator', 'width_pct' => 12],
                ['key' => 'field8_requirement',        'label' => '8. Requirements',            'width_pct' => 16],
                ['key' => 'field9_results',            'label' => '9. Results',                 'width_pct' => 14],
                ['key' => 'field10_qa_acceptance',     'label' => '10. QA Acceptance',          'width_pct' => 10],
                ['key' => 'field11_ncr_number',        'label' => '11. Non-Conformance Number', 'width_pct' => 12],
                ['key' => 'field14_comments',          'label' => '14. Comments',               'width_pct' => 22],
            ]),
            'primary_color' => '#1F4E79',
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // ============================================================
        // CUSTOM INSPECTION REPORTS — per-session header data
        // ============================================================
        Schema::create('custom_inspection_reports', function (Blueprint $table) {
            $table->id();
            $table->string('ir_number', 30)->unique();
            $table->foreignId('inspection_session_id')
                ->constrained('inspection_sessions')
                ->cascadeOnDelete();
            $table->foreignId('part_id')->constrained('parts');
            $table->foreignId('inspection_plan_id')->constrained('inspection_plans');
            $table->foreignId('template_id')
                ->constrained('custom_report_templates');

            // Optional FAI back-link — if the part already has an AS9102 we
            // can import balloon characteristics directly from Form 3.
            $table->foreignId('fai_form1_id')->nullable()
                ->constrained('fai_form1')->nullOnDelete();

            // Header fields per doc 3.5
            $table->string('part_number', 100)->nullable();
            $table->string('part_name', 200)->nullable();
            $table->string('revision', 20)->nullable();
            $table->unsignedInteger('quantity')->default(1);
            $table->string('report_title', 200)->nullable();
            $table->string('serial_lot_number', 100)->nullable();
            $table->string('work_order', 100)->nullable();
            $table->string('inspection_type', 30)->default('final');
            // receiving | in_process | final | other

            // Tolerance block: defaults from template, overridable per report
            $table->string('tolerance_block', 200)->nullable();
            $table->boolean('tolerance_block_overridden')->default(false);

            $table->string('inspector_name', 200)->nullable();

            // Signature block
            $table->string('prepared_by_name', 200)->nullable();
            $table->timestamp('prepared_at')->nullable();

            // Doc 3.5 lifecycle: draft → complete → signed
            $table->string('status', 20)->default('draft');
            $table->boolean('locked')->default(false);

            // Storage paths populated in Module 4.6
            $table->string('signature_path', 500)->nullable();
            $table->string('stamp_path', 500)->nullable();

            $table->foreignId('created_by')->nullable()
                ->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });

        // ============================================================
        // CUSTOM REPORT CHARACTERISTICS — 20 pre-numbered rows
        // ============================================================
        Schema::create('custom_report_characteristics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('custom_report_id')
                ->constrained('custom_inspection_reports')
                ->cascadeOnDelete();
            // Reference back to the source Plan characteristic (so the
            // requirement string stays canonical).
            $table->foreignId('characteristic_id')->nullable()
                ->constrained('fai_characteristics')->nullOnDelete();
            $table->unsignedSmallInteger('row_number');
            $table->unsignedInteger('balloon_number')->nullable();

            $table->string('field5_char_number', 30)->nullable();
            $table->string('field6_reference_location', 100)->nullable();
            $table->string('field7_char_designator', 50)->nullable();
            $table->text('field8_requirement')->nullable();
            $table->text('field9_results')->nullable();
            $table->string('field10_qa_acceptance', 20)->nullable();
            // accept | reject | na
            $table->string('field11_ncr_number', 30)->nullable();
            $table->text('field14_comments')->nullable();

            $table->string('pass_fail', 20)->default('not_measured');
            $table->boolean('override_flag')->default(false);

            $table->timestamps();

            $table->unique(['custom_report_id', 'row_number'], 'cr_row_unique');
            $table->index(['custom_report_id', 'pass_fail']);
        });

        // ============================================================
        // PARTS: fai_approved flag (drives Step 3 default report type)
        // ============================================================
        Schema::table('parts', function (Blueprint $table) {
            if (! Schema::hasColumn('parts', 'fai_approved')) {
                $table->boolean('fai_approved')->default(false)->after('classification');
                $table->timestamp('fai_approved_at')->nullable()->after('fai_approved');
                $table->unsignedBigInteger('fai_approved_form1_id')->nullable()->after('fai_approved_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('parts', function (Blueprint $table) {
            if (Schema::hasColumn('parts', 'fai_approved_form1_id')) {
                $table->dropColumn('fai_approved_form1_id');
            }
            if (Schema::hasColumn('parts', 'fai_approved_at')) {
                $table->dropColumn('fai_approved_at');
            }
            if (Schema::hasColumn('parts', 'fai_approved')) {
                $table->dropColumn('fai_approved');
            }
        });

        Schema::dropIfExists('custom_report_characteristics');
        Schema::dropIfExists('custom_inspection_reports');
        Schema::dropIfExists('custom_report_templates');
    }
};
