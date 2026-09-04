<?php

namespace App\Services\Reports;

use Illuminate\Support\Carbon;

/**
 * Management Review Packet — combines the 4 individual reports into
 * one payload with a cover page for the AS9100 §9.3 quarterly review.
 *
 * Downstream: fed straight to a single mPDF template so the QA
 * Manager can hand the owner + auditor one PDF instead of four.
 */
class ManagementReviewPacket
{
    public function __construct(
        private NcrParetoReport $pareto,
        private CapaSummaryReport $capa,
        private GaugeComplianceReport $gauge,
        private FaiStatusReport $fai,
    ) {}

    public function build(array $filters = []): array
    {
        [$from, $to] = $this->windowFrom($filters);
        $scoped = ['from' => $from->toDateString(), 'to' => $to->toDateString()];

        $ncr = $this->pareto->build($scoped);
        $capa = $this->capa->build($scoped);
        $gauge = $this->gauge->build($scoped);
        $fai = $this->fai->build($scoped);

        // Executive summary — the 6 numbers the owner reads first.
        $execSummary = [
            'total_ncrs' => $ncr['total_ncrs'],
            'top80_defects_count' => $ncr['top80_defects_count'],
            'capa_open' => $capa['kpi']['open_count'],
            'capa_overdue' => $capa['kpi']['overdue_open'],
            'gauge_compliance_pct' => $gauge['kpi']['current_pct'],
            'fai_first_pass_rate' => $fai['kpi']['first_pass_rate'],
        ];

        return [
            'report' => 'management_review_packet',
            'title' => 'Management Review Packet',
            'window' => $scoped,
            'exec_summary' => $execSummary,
            'sections' => [
                'ncr_pareto' => $ncr,
                'capa_summary' => $capa,
                'gauge_compliance' => $gauge,
                'fai_status' => $fai,
            ],
            'generated_at' => now()->toIso8601String(),
        ];
    }

    private function windowFrom(array $filters): array
    {
        $to = ! empty($filters['to']) ? Carbon::parse($filters['to'])->endOfDay() : now();
        // Quarterly review = 90-day window by default.
        $from = ! empty($filters['from']) ? Carbon::parse($filters['from'])->startOfDay() : $to->copy()->subDays(90);
        return [$from, $to];
    }
}
