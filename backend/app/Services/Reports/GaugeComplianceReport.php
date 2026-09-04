<?php

namespace App\Services\Reports;

use App\Models\Gauge;
use App\Models\GaugeCalibration;
use App\Models\GaugeOotAssessment;
use Illuminate\Support\Carbon;

/**
 * Gauge compliance — % current by location, overdue list, OOT history.
 *
 * The "location" column doubles as department here — most shops set it
 * to "Machine Shop", "QA Lab", "Assembly" etc. AS9100 §7.1.5 wants
 * shops to prove every measurement tool is calibrated on schedule; the
 * PDF version of this report is exactly that evidence.
 */
class GaugeComplianceReport
{
    public function build(array $filters = []): array
    {
        [$from, $to] = $this->windowFrom($filters);

        $gauges = Gauge::query()->get();

        // Compliance by location (used as department).
        $byLocation = $gauges->groupBy(fn ($g) => $g->location ?: 'Unassigned')->map(function ($group, $loc) {
            $total = $group->count();
            $inService = $group->filter(fn ($g) => ! $g->out_of_service);
            $current = $inService->filter(fn ($g) => $g->status === Gauge::STATUS_CURRENT)->count();
            $due = $inService->filter(fn ($g) => $g->status === Gauge::STATUS_DUE)->count();
            $overdue = $inService->filter(fn ($g) => $g->status === Gauge::STATUS_OVERDUE)->count();
            $oos = $group->filter(fn ($g) => $g->out_of_service)->count();
            $compliance = $inService->count() > 0
                ? round(($current + $due) / $inService->count() * 100, 1)
                : 100.0;
            return [
                'location' => $loc,
                'total' => $total,
                'current' => $current,
                'due' => $due,
                'overdue' => $overdue,
                'out_of_service' => $oos,
                'compliance_pct' => $compliance,
            ];
        })->values()->sortByDesc('total')->values()->all();

        // Overdue gauge list (sorted worst-first).
        $overdueList = $gauges
            ->filter(fn ($g) => ! $g->out_of_service && $g->status === Gauge::STATUS_OVERDUE)
            ->map(fn ($g) => [
                'gauge_id' => $g->gauge_id,
                'type' => $g->type,
                'location' => $g->location,
                'next_cal_due' => $g->next_cal_due?->toDateString(),
                'days_overdue' => $g->next_cal_due ? abs($g->days_until_due) : null,
            ])
            ->sortByDesc('days_overdue')
            ->values()
            ->all();

        // OOT history in the window.
        $ootHistory = GaugeOotAssessment::query()
            ->whereBetween('assessed_at', [$from, $to])
            ->with(['gauge:id,gauge_id,type', 'assessor:id,name'])
            ->orderByDesc('assessed_at')
            ->limit(50)
            ->get()
            ->map(fn ($o) => [
                'gauge_id' => $o->gauge?->gauge_id,
                'type' => $o->gauge?->type,
                'disposition' => $o->disposition,
                'assessed_at' => $o->assessed_at?->toIso8601String(),
                'assessor' => $o->assessor?->name,
            ])
            ->all();

        $totalGauges = $gauges->count();
        $inServiceCount = $gauges->filter(fn ($g) => ! $g->out_of_service)->count();
        $currentCount = $gauges->filter(fn ($g) => $g->status === Gauge::STATUS_CURRENT)->count();
        $overallCompliance = $inServiceCount > 0
            ? round($currentCount / $inServiceCount * 100, 1)
            : 100.0;

        return [
            'report' => 'gauge_compliance',
            'title' => 'Gauge Compliance',
            'window' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'kpi' => [
                'total_gauges' => $totalGauges,
                'in_service' => $inServiceCount,
                'current_pct' => $overallCompliance,
                'overdue_count' => count($overdueList),
                'oot_events' => count($ootHistory),
            ],
            'by_location' => $byLocation,
            'overdue_list' => $overdueList,
            'oot_history' => $ootHistory,
            'generated_at' => now()->toIso8601String(),
        ];
    }

    private function windowFrom(array $filters): array
    {
        $to = ! empty($filters['to']) ? Carbon::parse($filters['to'])->endOfDay() : now();
        $from = ! empty($filters['from']) ? Carbon::parse($filters['from'])->startOfDay() : $to->copy()->subMonths(12);
        return [$from, $to];
    }
}
