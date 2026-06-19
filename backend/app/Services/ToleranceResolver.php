<?php

namespace App\Services;

use App\Models\FaiCharacteristic;
use App\Models\InspectionPlan;

/**
 * Resolves the effective tolerance for a characteristic.
 *
 * Two modes:
 *   - use_default_tolerance=true  -> pulled from plan defaults by
 *                                    nominal_decimals bucket, or tol_angular
 *                                    for angle types.
 *   - use_default_tolerance=false -> upper_tolerance / lower_tolerance on
 *                                    the row used directly.
 *
 * Block tolerance applies to: linear, diameter, radius, angle.
 * Skipped for: gdt, surface_finish, threaded, chamfer, note.
 */
class ToleranceResolver
{
    /**
     * @return array{0: ?float, 1: ?float} [upper, lower] as positive magnitudes
     */
    public function resolve(FaiCharacteristic $char, ?InspectionPlan $plan = null): array
    {
        $plan ??= $char->plan;

        $excluded = ['gdt', 'surface_finish', 'threaded', 'chamfer', 'note'];
        if (in_array($char->char_type, $excluded, true)) {
            return $this->raw($char);
        }

        if (! $char->use_default_tolerance || ! $plan) {
            return $this->raw($char);
        }

        if ($char->char_type === 'angle') {
            $tol = (float) $plan->tol_angular;
            return [$tol, $tol];
        }

        $decimals = (int) ($char->nominal_decimals ?? 0);
        $tol = match (true) {
            $decimals >= 3 => (float) $plan->tol_3dp,
            $decimals === 2 => (float) $plan->tol_2dp,
            default => (float) $plan->tol_1dp,
        };

        return [$tol, $tol];
    }

    /** @return array{0: ?float, 1: ?float} */
    private function raw(FaiCharacteristic $char): array
    {
        return [
            $char->upper_tolerance !== null ? abs((float) $char->upper_tolerance) : null,
            $char->lower_tolerance !== null ? abs((float) $char->lower_tolerance) : null,
        ];
    }
}
