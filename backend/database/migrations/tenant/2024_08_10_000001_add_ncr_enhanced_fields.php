<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * NCR Module enhancements per doc section 3.10 / build prompt 4.7.
 *
 *   - lot_serial:         which specific part(s) affected (traceability)
 *   - quantity_affected:  how many parts hit
 *   - defect_code:        categorization for Pareto analysis
 *   - detected_by:        who found the defect (accountability, may differ
 *                         from created_by if inspector logs on behalf of shop)
 *   - detection_point:    incoming / in_process / final / customer — key
 *                         AS9100 metric (customer detection = escape event)
 *   - material_cost:      $ wasted on scrap/rework material
 *   - labor_hours:        hours spent on the defect
 *   - scrap_value:        recoverable value from selling scrap
 *   - capa_id:            link to CAPA if this defect triggered a root
 *                         cause investigation (constraint added later
 *                         when CAPA module ships)
 *
 * Also renames the `no_defect_found` disposition to `mrb` (Material
 * Review Board) per doc — aerospace-standard term for the multi-signature
 * committee decision path when disposition is ambiguous.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ncrs', function (Blueprint $table) {
            $table->string('lot_serial', 100)->nullable()->after('inspection_session_id');
            $table->unsignedInteger('quantity_affected')->nullable()->after('lot_serial');
            $table->string('defect_code', 50)->nullable()->after('quantity_affected');
            $table->foreignId('detected_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            $table->string('detection_point', 20)->nullable()->after('detected_by');
            $table->decimal('material_cost', 10, 2)->nullable()->after('closure_notes');
            $table->decimal('labor_hours', 6, 2)->nullable()->after('material_cost');
            $table->decimal('scrap_value', 10, 2)->nullable()->after('labor_hours');
            // capa_id: nullable, no FK yet — CAPA table lands in next sprint.
            // Adding the column now so the escalation button has somewhere
            // to write when we ship the CAPA module.
            $table->unsignedBigInteger('capa_id')->nullable()->after('scrap_value');

            $table->index('defect_code');
            $table->index('detection_point');
            $table->index('capa_id');
        });

        // Rename disposition enum value: no_defect_found -> mrb.
        // Laravel's ->enum() creates a Postgres CHECK constraint (not a
        // native ENUM type), so we drop + recreate the check, then update
        // existing rows.
        DB::statement("ALTER TABLE ncrs DROP CONSTRAINT IF EXISTS ncrs_disposition_check");
        DB::statement("UPDATE ncrs SET disposition = 'mrb' WHERE disposition = 'no_defect_found'");
        DB::statement("ALTER TABLE ncrs ADD CONSTRAINT ncrs_disposition_check CHECK (disposition IN ('pending','rework','scrap','use_as_is','return_to_vendor','mrb'))");

        // Detection point CHECK constraint — match doc's enum values
        DB::statement("ALTER TABLE ncrs ADD CONSTRAINT ncrs_detection_point_check CHECK (detection_point IS NULL OR detection_point IN ('incoming','in_process','final','customer'))");
    }

    public function down(): void
    {
        // Revert disposition rename before dropping columns
        DB::statement("ALTER TABLE ncrs DROP CONSTRAINT IF EXISTS ncrs_disposition_check");
        DB::statement("UPDATE ncrs SET disposition = 'no_defect_found' WHERE disposition = 'mrb'");
        DB::statement("ALTER TABLE ncrs ADD CONSTRAINT ncrs_disposition_check CHECK (disposition IN ('pending','rework','scrap','use_as_is','return_to_vendor','no_defect_found'))");

        DB::statement("ALTER TABLE ncrs DROP CONSTRAINT IF EXISTS ncrs_detection_point_check");

        Schema::table('ncrs', function (Blueprint $table) {
            $table->dropIndex(['defect_code']);
            $table->dropIndex(['detection_point']);
            $table->dropIndex(['capa_id']);
            $table->dropForeign(['detected_by']);
            $table->dropColumn([
                'lot_serial',
                'quantity_affected',
                'defect_code',
                'detected_by',
                'detection_point',
                'material_cost',
                'labor_hours',
                'scrap_value',
                'capa_id',
            ]);
        });
    }
};
