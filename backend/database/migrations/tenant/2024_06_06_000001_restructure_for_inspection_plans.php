<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Restructure Phase 2 schema to match doc Section 4.2 exactly.
 *
 * - Drops empty Phase 2a tables that did not match doc (inspection_plans,
 *   plan_characteristics, drawing_bubbles).
 * - Creates them fresh with the doc-mandated columns + types.
 * - Adds plan_id to drawings so they can be grouped under a plan
 *   (drawings table now plays the role of fai_documents per doc terminology).
 * - Adds part_type, material_spec, uom to parts per doc 4.1.
 * - Creates report_sequences for IP-YYYY-NNNN auto-numbering.
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1. Drop empty Phase 2a placeholder tables (in dep order)
        Schema::dropIfExists('inspection_measurements');
        Schema::dropIfExists('inspections');
        Schema::dropIfExists('drawing_bubbles');
        Schema::dropIfExists('plan_characteristics');
        Schema::dropIfExists('inspection_plans');

        // 2. Add doc-required columns to parts
        Schema::table('parts', function (Blueprint $table) {
            if (! Schema::hasColumn('parts', 'part_type')) {
                $table->string('part_type', 20)->default('finish')->after('description');
                // raw | sub | assembly | finish
            }
            if (! Schema::hasColumn('parts', 'material_spec')) {
                $table->string('material_spec', 200)->nullable()->after('material');
            }
            if (! Schema::hasColumn('parts', 'uom')) {
                $table->string('uom', 20)->default('ea')->after('weight_unit');
                // unit of measure: ea, lb, kg, ft, m, etc
            }
        });

        // 3. report_sequences — for IP-YYYY-NNNN, FAI-YYYY-NNNN, NCR-YYYY-NNNN, etc
        Schema::create('report_sequences', function (Blueprint $table) {
            $table->string('prefix', 20);  // 'IP', 'FAI', 'NCR', 'CAPA', 'IR'
            $table->smallInteger('year');
            $table->unsignedInteger('seq')->default(0);
            $table->primary(['prefix', 'year']);
        });

        // 4. inspection_plans (per doc 4.2 exact spec)
        Schema::create('inspection_plans', function (Blueprint $table) {
            $table->id();
            $table->string('plan_number', 20)->unique();  // 'IP-2026-0001'
            $table->foreignId('part_id')->constrained('parts')->cascadeOnDelete();
            $table->string('plan_name', 200);
            $table->string('status', 20)->default('draft');
            // draft | active | superseded
            $table->unsignedInteger('balloon_count')->default(0);
            $table->unsignedInteger('characteristic_count')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['part_id', 'status']);
            $table->index('plan_number');
        });

        // 5. Add plan_id to drawings (it serves as fai_documents now)
        Schema::table('drawings', function (Blueprint $table) {
            if (! Schema::hasColumn('drawings', 'plan_id')) {
                $table->foreignId('plan_id')->nullable()->after('part_id')
                    ->constrained('inspection_plans')->nullOnDelete();
            }
            if (! Schema::hasColumn('drawings', 'document_label')) {
                $table->string('document_label', 100)->nullable()->after('original_filename');
            }
            if (! Schema::hasColumn('drawings', 'sort_order')) {
                $table->unsignedSmallInteger('sort_order')->default(0)->after('document_label');
            }
        });

        // 6. drawing_balloons (per doc 4.2 exact spec)
        Schema::create('drawing_balloons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plan_id')->constrained('inspection_plans')->cascadeOnDelete();
            $table->foreignId('fai_document_id')->constrained('drawings')->cascadeOnDelete();
            $table->unsignedInteger('balloon_number');  // continuous across docs/pages
            $table->unsignedSmallInteger('page_number');
            $table->decimal('x_pct', 7, 4);  // 0.0000 - 100.0000
            $table->decimal('y_pct', 7, 4);
            $table->string('char_type', 30);
            // linear | diameter | radius | angle | gdt | surface_finish | note
            $table->string('source', 20)->default('manual');
            // manual | ocr
            $table->foreignId('characteristic_id')->nullable();  // FK added after fai_characteristics
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['plan_id', 'balloon_number']);
            $table->index(['fai_document_id', 'page_number']);
        });

        // 7. fai_characteristics (per doc 4.2 exact spec)
        Schema::create('fai_characteristics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plan_id')->constrained('inspection_plans')->cascadeOnDelete();
            $table->unsignedInteger('balloon_number');
            $table->string('char_type', 30);
            $table->text('description')->nullable();

            // Linear / diameter / radius / angle
            $table->decimal('nominal', 12, 6)->nullable();
            $table->decimal('upper_tolerance', 12, 6)->nullable();
            $table->decimal('lower_tolerance', 12, 6)->nullable();
            $table->string('unit', 20)->nullable();  // in, mm, deg

            // GD&T
            $table->string('gdt_symbol', 10)->nullable();
            $table->string('gdt_datum_a', 20)->nullable();
            $table->string('gdt_datum_b', 20)->nullable();
            $table->string('gdt_datum_c', 20)->nullable();
            $table->string('gdt_material_condition', 5)->nullable();  // mmc | lmc | rfs

            // Surface finish
            $table->string('finish_value', 50)->nullable();
            $table->string('finish_unit', 30)->nullable();
            // Ra μin / Ra μm / Rz μin / Rz μm / RMS μin

            $table->string('inspection_method', 100)->nullable();
            $table->text('requirement_string')->nullable();  // formatted display
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['plan_id', 'balloon_number']);
        });

        // 8. Add FK constraint balloons.characteristic_id → fai_characteristics.id
        Schema::table('drawing_balloons', function (Blueprint $table) {
            $table->foreign('characteristic_id')
                ->references('id')
                ->on('fai_characteristics')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('drawing_balloons', function (Blueprint $table) {
            $table->dropForeign(['characteristic_id']);
        });

        Schema::dropIfExists('fai_characteristics');
        Schema::dropIfExists('drawing_balloons');

        Schema::table('drawings', function (Blueprint $table) {
            if (Schema::hasColumn('drawings', 'sort_order')) {
                $table->dropColumn('sort_order');
            }
            if (Schema::hasColumn('drawings', 'document_label')) {
                $table->dropColumn('document_label');
            }
            if (Schema::hasColumn('drawings', 'plan_id')) {
                $table->dropForeign(['plan_id']);
                $table->dropColumn('plan_id');
            }
        });

        Schema::dropIfExists('inspection_plans');
        Schema::dropIfExists('report_sequences');

        Schema::table('parts', function (Blueprint $table) {
            if (Schema::hasColumn('parts', 'uom')) {
                $table->dropColumn('uom');
            }
            if (Schema::hasColumn('parts', 'material_spec')) {
                $table->dropColumn('material_spec');
            }
            if (Schema::hasColumn('parts', 'part_type')) {
                $table->dropColumn('part_type');
            }
        });
    }
};
