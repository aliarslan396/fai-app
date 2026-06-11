<?php

namespace App\Services;

use App\Models\FaiCharacteristic;
use App\Models\FaiForm1;
use App\Models\FaiForm3Row;
use App\Models\InspectionPlan;

/**
 * Per doc Section 4.4 PART C — Sync Engine.
 *
 * Pushes Plan balloon characteristics into Form 3 rows on demand. Re-runs the
 * RequirementFormatter so any Plan edits cascade to open inspections.
 * Override flag skips rows the inspector explicitly took over.
 */
class Form3SyncEngine
{
    public function __construct(private RequirementFormatter $formatter) {}

    /**
     * @return int Number of Form 3 rows synced (created or updated).
     */
    public function sync(FaiForm1 $form1): int
    {
        $plan = InspectionPlan::with(['characteristics', 'balloons'])->findOrFail($form1->inspection_plan_id);
        $synced = 0;

        $charByBalloon = $plan->characteristics->keyBy('balloon_number');

        foreach ($plan->balloons->sortBy('balloon_number') as $balloon) {
            $char = $charByBalloon->get($balloon->balloon_number);
            if (! $char) {
                continue;
            }

            $requirement = $this->formatter->format($char->only([
                'char_type', 'description',
                'nominal', 'upper_tolerance', 'lower_tolerance', 'unit',
                'gdt_symbol', 'gdt_datum_a', 'gdt_datum_b', 'gdt_datum_c',
                'gdt_material_condition',
                'finish_value', 'finish_unit',
            ]));

            $existing = FaiForm3Row::where('fai_form1_id', $form1->id)
                ->where('balloon_number', $balloon->balloon_number)
                ->first();

            if ($existing) {
                if (! $existing->override_flag) {
                    $existing->fill([
                        'characteristic_id' => $char->id,
                        'field8_requirement' => $requirement,
                        'field5_char_number' => (string) $balloon->balloon_number,
                        'sort_order' => $balloon->balloon_number,
                    ])->save();
                }
            } else {
                FaiForm3Row::create([
                    'fai_form1_id' => $form1->id,
                    'characteristic_id' => $char->id,
                    'balloon_number' => $balloon->balloon_number,
                    'field5_char_number' => (string) $balloon->balloon_number,
                    'field8_requirement' => $requirement,
                    'pass_fail' => 'not_measured',
                    'sort_order' => $balloon->balloon_number,
                ]);
            }
            $synced++;
        }

        return $synced;
    }
}
