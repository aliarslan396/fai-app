<?php

namespace App\Services;

use App\Models\FaiCharacteristic;

/**
 * Evaluates an inspector's measured result against the characteristic's
 * nominal + tolerance from the Plan.
 *
 * Per doc 3.2 Pass/Fail Logic:
 *   min = nominal - lower_tolerance
 *   max = nominal + upper_tolerance
 *   if (measured >= min && measured <= max) → PASS
 *   else → FAIL
 *
 * Returns 'pass' | 'fail' | 'not_measured' | 'na'.
 */
class PassFailEvaluator
{
    public function __construct(private ToleranceResolver $resolver) {}

    public function evaluate(?FaiCharacteristic $char, ?string $result): string
    {
        if (! $char) {
            return 'not_measured';
        }
        $result = trim((string) $result);
        if ($result === '') {
            return 'not_measured';
        }

        $type = $char->char_type;

        // Visual / note types — accept any non-empty result as pass
        if (in_array($type, ['note', 'surface_finish'], true)) {
            // Inspector free-form — treat as accept unless explicitly bad
            return 'pass';
        }

        // Numeric types: linear, diameter, radius, angle
        if (in_array($type, ['linear', 'diameter', 'radius', 'angle'], true)) {
            return $this->evaluateNumeric($char, $result);
        }

        // GD&T: typically a numeric position tolerance compared against measured
        if ($type === 'gdt') {
            return $this->evaluateGdt($char, $result);
        }

        return 'not_measured';
    }

    private function evaluateNumeric(FaiCharacteristic $char, string $result): string
    {
        $measured = $this->parseNumber($result);
        if ($measured === null) {
            return 'not_measured';
        }

        [$upperTol, $lowerTol] = $this->resolver->resolve($char);
        $nominal = (float) $char->nominal;

        $min = $nominal - (float) ($lowerTol ?? 0);
        $max = $nominal + (float) ($upperTol ?? 0);

        return ($measured >= $min && $measured <= $max) ? 'pass' : 'fail';
    }

    private function evaluateGdt(FaiCharacteristic $char, string $result): string
    {
        // For GD&T tolerance zones, the result must be <= tolerance value.
        // Lower bound is implicitly 0 (cannot be negative position deviation).
        $measured = $this->parseNumber($result);
        if ($measured === null) {
            return 'not_measured';
        }

        // GD&T is in the excluded list — resolver returns the raw stored value.
        [$tolerance, ] = $this->resolver->resolve($char);
        if (! $tolerance || $tolerance <= 0) {
            return 'not_measured';
        }

        return $measured <= $tolerance ? 'pass' : 'fail';
    }

    /**
     * Parse a number from inspector input — accepts plain numbers and
     * common typos like "1,547" (European comma decimal).
     */
    private function parseNumber(string $s): ?float
    {
        $cleaned = preg_replace('/[^\d.\-+eE,]/', '', $s) ?? '';
        $cleaned = str_replace(',', '.', $cleaned);
        if ($cleaned === '' || ! is_numeric($cleaned)) {
            return null;
        }

        return (float) $cleaned;
    }
}
