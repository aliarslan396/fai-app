<?php

namespace App\Services\Reports;

use App\Models\FaiForm1;
use Illuminate\Support\Carbon;

/**
 * FAI Status — filtered table of FAIs by date / status / customer.
 *
 * Answers "how many first-articles did we complete for each customer,
 * and how many were accepted first pass vs returned for rework?"
 * Customer-facing supplier-scorecard input.
 */
class FaiStatusReport
{
    public function build(array $filters = []): array
    {
        [$from, $to] = $this->windowFrom($filters);

        $query = FaiForm1::query()
            ->whereBetween('created_at', [$from, $to])
            ->with(['part:id,part_number,revision,customer_id', 'part.customer:id,name']);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (! empty($filters['customer_id'])) {
            $query->whereHas('part', fn ($q) => $q->where('customer_id', $filters['customer_id']));
        }

        $fais = $query->orderByDesc('created_at')->get();

        $byStatus = $fais->groupBy('status')->map->count()->toArray();
        $byCustomer = $fais->groupBy(fn ($f) => $f->part?->customer?->name ?: 'No customer')
            ->map(function ($group) {
                return [
                    'total' => $group->count(),
                    'accepted' => $group->where('status', 'accepted')->count(),
                    'submitted' => $group->where('status', 'submitted')->count(),
                    'returned' => $group->where('status', 'returned')->count(),
                    'in_work' => $group->where('status', 'in_work')->count(),
                ];
            })->toArray();

        $rows = $fais->map(fn ($f) => [
            'fai_number' => $f->fai_number,
            'part_number' => $f->part?->part_number,
            'revision' => $f->part?->revision,
            'customer' => $f->part?->customer?->name,
            'status' => $f->status,
            'created_at' => $f->created_at?->toDateString(),
        ])->all();

        $total = $fais->count();
        $accepted = $fais->where('status', 'accepted')->count();
        $firstPassRate = $total > 0 ? round($accepted / $total * 100, 1) : 0;

        return [
            'report' => 'fai_status',
            'title' => 'FAI Status',
            'window' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'kpi' => [
                'total' => $total,
                'accepted' => $accepted,
                'in_work' => $byStatus['in_work'] ?? 0,
                'submitted' => $byStatus['submitted'] ?? 0,
                'returned' => $byStatus['returned'] ?? 0,
                'first_pass_rate' => $firstPassRate,
            ],
            'by_status' => $byStatus,
            'by_customer' => $byCustomer,
            'rows' => $rows,
            'generated_at' => now()->toIso8601String(),
        ];
    }

    private function windowFrom(array $filters): array
    {
        $to = ! empty($filters['to']) ? Carbon::parse($filters['to'])->endOfDay() : now();
        $from = ! empty($filters['from']) ? Carbon::parse($filters['from'])->startOfDay() : $to->copy()->subMonths(3);
        return [$from, $to];
    }
}
