<?php

namespace App\Services;

/**
 * Builds the doc-mandated requirement strings from characteristic data.
 * Mirrors the JS counterpart so both produce IDENTICAL strings.
 *
 * Formats per doc 3.6 / 4.4:
 *   linear:         "2.5000 ±0.0050 in"
 *                   or "2.5000 +0.0050/-0.0030 in" (asymmetric)
 *   diameter:       "Ø2.5000 ±0.0050 in"
 *   radius:         "R2.5000 ±0.0050 in"
 *   angle:          "45.000° ±0.500°"
 *   gdt:            "⊕ | Ø0.0100Ⓜ | A | B"  (pipe-separated FCF)
 *   surface_finish: "Ra μin 63"
 *   note:           description as-is
 */
class RequirementFormatter
{
    private const MMC_SYMBOL = "\u{24C2}"; // Ⓜ
    private const LMC_SYMBOL = "\u{24C1}"; // Ⓛ
    private const DIAMETER = "\u{00D8}";   // Ø

    public function format(array $char): string
    {
        // Ensure decimal separator stays '.' regardless of server locale
        $oldLocale = setlocale(LC_NUMERIC, '0');
        setlocale(LC_NUMERIC, 'C');

        try {
            return match ($char['char_type'] ?? '') {
                'linear' => $this->linear($char),
                'diameter' => self::DIAMETER . $this->linear($char),
                'radius' => 'R' . $this->linear($char),
                'angle' => $this->angle($char),
                'gdt' => $this->gdt($char),
                'surface_finish' => $this->surfaceFinish($char),
                'note' => (string) ($char['description'] ?? ''),
                default => (string) ($char['description'] ?? ''),
            };
        } finally {
            if ($oldLocale !== false) {
                setlocale(LC_NUMERIC, $oldLocale);
            }
        }
    }

    private function linear(array $c): string
    {
        $nominal = $this->fmt($c['nominal'] ?? 0, 4);
        $upper = (float) ($c['upper_tolerance'] ?? 0);
        $lower = (float) ($c['lower_tolerance'] ?? 0);
        $unit = $c['unit'] ?? 'in';

        if (abs($upper - $lower) < 1e-9) {
            return "{$nominal} ±" . $this->fmt($upper, 4) . " {$unit}";
        }

        // Asymmetric: upper as positive, lower as negative
        $upStr = '+' . $this->fmt(abs($upper), 4);
        $loStr = '-' . $this->fmt(abs($lower), 4);

        return "{$nominal} {$upStr}/{$loStr} {$unit}";
    }

    private function angle(array $c): string
    {
        $nominal = $this->fmt($c['nominal'] ?? 0, 3);
        $upper = (float) ($c['upper_tolerance'] ?? 0);
        $lower = (float) ($c['lower_tolerance'] ?? 0);

        if (abs($upper - $lower) < 1e-9) {
            return "{$nominal}° ±" . $this->fmt($upper, 3) . '°';
        }

        return "{$nominal}° +" . $this->fmt(abs($upper), 3) . '/-' . $this->fmt(abs($lower), 3) . '°';
    }

    private function gdt(array $c): string
    {
        $symbol = (string) ($c['gdt_symbol'] ?? '');
        $tol = isset($c['upper_tolerance']) && $c['upper_tolerance'] !== null
            ? self::DIAMETER . $this->fmt($c['upper_tolerance'], 4)
            : '';

        $mc = strtolower((string) ($c['gdt_material_condition'] ?? 'rfs'));
        if ($mc === 'mmc') {
            $tol .= self::MMC_SYMBOL;
        } elseif ($mc === 'lmc') {
            $tol .= self::LMC_SYMBOL;
        }
        // rfs = no modifier

        $parts = [$symbol, $tol];
        foreach (['gdt_datum_a', 'gdt_datum_b', 'gdt_datum_c'] as $datum) {
            if (! empty($c[$datum])) {
                $parts[] = $c[$datum];
            }
        }

        return implode(' | ', array_filter($parts, fn ($p) => $p !== ''));
    }

    private function surfaceFinish(array $c): string
    {
        $unit = $c['finish_unit'] ?? 'Ra μin';
        $value = $c['finish_value'] ?? '';

        return trim("{$unit} {$value}");
    }

    private function fmt(float|int|string|null $n, int $places): string
    {
        return number_format((float) ($n ?? 0), $places, '.', '');
    }
}
