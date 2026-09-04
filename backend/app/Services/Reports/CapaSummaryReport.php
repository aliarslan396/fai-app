<?php

namespace App\Services\Reports;

use App\Models\Capa;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * CAPA Summary — open/closed trend + avg days to close + source breakdown.
 *
 * Answers the two questions the auditor and the owner always ask:
 *   "Are corrective actions actually getting closed?"
 *   "How long is closure taking on average?"
 */
class CapaSummaryReport
{
    public function build(array $filters = []): array
    {
        [$from, $to] = $this->windowFrom($filters);

        $capas = Capa::query()
            ->whereBetween('created_at', [$from, $to])
            ->get();

        $openStatuses = [Capa::STATUS_OPEN, Capa::STATUS_ROOT_CAUSE_PENDING,
            Capa::STATUS_ACTION_PLAN_PENDING, Capa::STATUS_APPROVED, Capa::STATUS_IN_PROGRESS];
        $closedStatuses = [Capa::STATUS_CLOSED, Capa::STATUS_INEFFECTIVE];

        $open = $capas->whereIn('status', $openStatuses);
        $closed = $capas->whereIn('status', $closedStatuses);

        // Avg days from created_at → closed_at for closed CAPAs.
        $daysToClose = $closed->filter(fn ($c) => $c->closed_at)->map(function ($c) {
            return Carbon::parse($c->created_at)->diffInDays(Carbon::parse($c->closed_at));
        });

        // Monthly bucket for the bar chart.
        $monthly = [];
        $cursor = $from->copy()->startOfMonth();
        while ($cursor->lte($to)) {
            $ym = $cursor->format('Y-m');
            $monthly[$ym] = [
                'month' => $ym,
                'opened' => 0,
                'closed' => 0,
            ];
            $cursor->addMonth();
        }
        foreach ($capas as $c) {
            $openKey = Carbon::parse($c->created_at)->format('Y-m');
            if (isset($monthly[$openKey])) {
                $monthly[$openKey]['opened']++;
            }
            if ($c->closed_at && in_array($c->status, $closedStatuses, true)) {
                $closeKey = Carbon::parse($c->closed_at)->format('Y-m');
                if (isset($monthly[$closeKey])) {
                    $monthly[$closeKey]['closed']++;
                }
            }
        }

        // Source breakdown (ncr / audit / customer / internal)
        $sourceBreakdown = $capas->groupBy('source')->map->count()->toArray();

        // Overdue = open CAPAs older than 30 days with no closed_at.
        $overdue = $open->filter(fn ($c) => now()->diffInDays(Carbon::parse($c->created_at)) > 30)->count();

        return [
            'report' => 'capa_summary',
            'title' => 'CAPA Summary',
            'window' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'kpi' => [
                'open_count' => $open->count(),
                'closed_count' => $closed->count(),
                'ineffective_count' => $capas->where('status', Capa::STATUS_INEFFECTIVE)->count(),
                'overdue_open' => $overdue,
                'avg_days_to_close' => $daysToClose->isEmpty() ? null : round($daysToClose->avg(), 1),
                'median_days_to_close' => $daysToClose->isEmpty() ? null : (int) $daysToClose->median(),
            ],
            'monthly' => array_values($monthly),
            'source_breakdown' => $sourceBreakdown,
            'generated_at' => now()->toIso8601String(),
        ];
    }

    private function windowFrom(array $filters): array
    {
        $to = ! empty($filters['to']) ? Carbon::parse($filters['to'])->endOfDay() : now();
        // Default 12-month window so the monthly bar chart has enough columns.
        $from = ! empty($filters['from']) ? Carbon::parse($filters['from'])->startOfDay() : $to->copy()->subMonths(12)->startOfMonth();
        return [$from, $to];
    }
}
