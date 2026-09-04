<?php

namespace App\Services\Reports;

use App\Models\Ncr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * NCR Pareto — defect-code frequency with cumulative %.
 *
 * Classic 80/20 view: which defects account for the bulk of NCRs?
 * The auditor reads the top 3 rows and knows where the shop's real
 * problems are. Backing data for the AS9100 §9.3 Management Review.
 */
class NcrParetoReport
{
    /**
     * @param array $filters ['from' => Y-m-d, 'to' => Y-m-d, 'customer_id' => int|null, 'part_id' => int|null]
     * @return array report payload — safe to hand to the frontend or a PDF template
     */
    public function build(array $filters = []): array
    {
        [$from, $to] = $this->windowFrom($filters);

        $query = Ncr::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereNotNull('defect_code')
            ->where('defect_code', '!=', '');

        if (! empty($filters['part_id'])) {
            $query->where('part_id', $filters['part_id']);
        }
        if (! empty($filters['customer_id'])) {
            $query->whereHas('part', fn ($q) => $q->where('customer_id', $filters['customer_id']));
        }

        $rows = $query
            ->selectRaw('defect_code, COUNT(*) as count')
            ->groupBy('defect_code')
            ->orderByDesc('count')
            ->get();

        $total = (int) $rows->sum('count');
        $running = 0;
        $data = $rows->map(function ($r) use ($total, &$running) {
            $count = (int) $r->count;
            $pct = $total > 0 ? round(($count / $total) * 100, 1) : 0;
            $running += $pct;
            return [
                'defect_code' => $r->defect_code,
                'count' => $count,
                'pct' => $pct,
                'cumulative_pct' => round($running, 1),
            ];
        })->all();

        // Which rows cover 80% of the pain? Highlight for the reader.
        $top80Index = null;
        foreach ($data as $i => $row) {
            if ($row['cumulative_pct'] >= 80) {
                $top80Index = $i;
                break;
            }
        }

        return [
            'report' => 'ncr_pareto',
            'title' => 'NCR Pareto',
            'window' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'total_ncrs' => $total,
            'unique_defects' => count($data),
            'top80_defects_count' => $top80Index !== null ? $top80Index + 1 : count($data),
            'rows' => $data,
            'generated_at' => now()->toIso8601String(),
        ];
    }

    private function windowFrom(array $filters): array
    {
        $to = ! empty($filters['to']) ? Carbon::parse($filters['to'])->endOfDay() : now();
        $from = ! empty($filters['from']) ? Carbon::parse($filters['from'])->startOfDay() : $to->copy()->subDays(90);
        return [$from, $to];
    }
}
