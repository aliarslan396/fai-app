<?php

namespace App\Services;

use App\Models\CustomInspectionReport;
use App\Models\CustomReportCharacteristic;
use App\Models\InspectionPlan;

/**
 * Per doc Section 4.5 — populates the 20-row DEF-QA-003 table from the
 * inspection plan's balloon characteristics. Re-runnable.
 *
 * Behaviour mirrors Form3SyncEngine but writes to
 * custom_report_characteristics with row_number 1..N (max from template).
 */
class CustomReportSyncEngine
{
    public function __construct(
        private RequirementFormatter $formatter,
        private ToleranceResolver $resolver,
    ) {}

    public function sync(CustomInspectionReport $report): int
    {
        if ($report->isLocked()) {
            throw new \RuntimeException('Cannot sync rows: report is locked.');
        }

        $plan = InspectionPlan::with(['characteristics', 'balloons'])
            ->findOrFail($report->inspection_plan_id);

        $maxRows = (int) ($report->template?->max_characteristic_rows ?? 20);

        $balloons = $plan->balloons->sortBy('balloon_number')->values();
        $charByBalloon = $plan->characteristics->keyBy('balloon_number');

        $synced = 0;
        $rowNumber = 1;

        foreach ($balloons as $balloon) {
            if ($rowNumber > $maxRows) {
                break;
            }
            $char = $charByBalloon->get($balloon->balloon_number);
            if (! $char) {
                continue;
            }

            [$resolvedUpper, $resolvedLower] = $this->resolver->resolve($char, $plan);

            $requirement = $this->formatter->format([
                ...$char->only([
                    'char_type', 'description', 'nominal', 'unit',
                    'gdt_symbol', 'gdt_datum_a', 'gdt_datum_b', 'gdt_datum_c',
                    'gdt_material_condition', 'finish_value', 'finish_unit',
                ]),
                'upper_tolerance' => $resolvedUpper,
                'lower_tolerance' => $resolvedLower,
            ]);

            $existing = CustomReportCharacteristic::where('custom_report_id', $report->id)
                ->where('row_number', $rowNumber)
                ->first();

            if ($existing) {
                if (! $existing->override_flag) {
                    $existing->fill([
                        'characteristic_id' => $char->id,
                        'balloon_number' => $balloon->balloon_number,
                        'field5_char_number' => (string) $rowNumber,
                        'field8_requirement' => $requirement,
                    ])->save();
                }
            } else {
                CustomReportCharacteristic::create([
                    'custom_report_id' => $report->id,
                    'characteristic_id' => $char->id,
                    'row_number' => $rowNumber,
                    'balloon_number' => $balloon->balloon_number,
                    'field5_char_number' => (string) $rowNumber,
                    'field8_requirement' => $requirement,
                    'pass_fail' => 'not_measured',
                ]);
            }
            $rowNumber++;
            $synced++;
        }

        // Fill empty placeholder rows up to maxRows so layout matches doc spec
        while ($rowNumber <= $maxRows) {
            $exists = CustomReportCharacteristic::where('custom_report_id', $report->id)
                ->where('row_number', $rowNumber)
                ->exists();
            if (! $exists) {
                CustomReportCharacteristic::create([
                    'custom_report_id' => $report->id,
                    'row_number' => $rowNumber,
                    'field5_char_number' => (string) $rowNumber,
                    'pass_fail' => 'na',
                ]);
            }
            $rowNumber++;
        }

        return $synced;
    }
}
