<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Services\Reports\CapaSummaryReport;
use App\Services\Reports\FaiStatusReport;
use App\Services\Reports\GaugeComplianceReport;
use App\Services\Reports\ManagementReviewPacket;
use App\Services\Reports\NcrParetoReport;
use App\Services\Reports\ReportPdfBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * KoolReport suite endpoints (doc §4.8 / §3.11 / §9.3).
 *
 * Every report exposes two verbs: JSON (`data`) for the interactive
 * preview + charts, and PDF (`pdf`) for the AS9100 management review
 * evidence file. Filters are always query-string so URLs stay
 * shareable and cache-friendly.
 */
class ReportsController extends Controller
{
    public function __construct(
        private NcrParetoReport $pareto,
        private CapaSummaryReport $capa,
        private GaugeComplianceReport $gauge,
        private FaiStatusReport $fai,
        private ManagementReviewPacket $packet,
        private ReportPdfBuilder $pdf,
    ) {}

    public function ncrParetoData(Request $r): JsonResponse
    {
        $this->checkPermission('reports.view');
        return response()->json($this->pareto->build($this->filters($r)));
    }

    public function ncrParetoPdf(Request $r): Response
    {
        $this->checkPermission('reports.view');
        return $this->pdf->render('ncr_pareto', $this->pareto->build($this->filters($r)));
    }

    public function capaSummaryData(Request $r): JsonResponse
    {
        $this->checkPermission('reports.view');
        return response()->json($this->capa->build($this->filters($r)));
    }

    public function capaSummaryPdf(Request $r): Response
    {
        $this->checkPermission('reports.view');
        return $this->pdf->render('capa_summary', $this->capa->build($this->filters($r)));
    }

    public function gaugeComplianceData(Request $r): JsonResponse
    {
        $this->checkPermission('reports.view');
        return response()->json($this->gauge->build($this->filters($r)));
    }

    public function gaugeCompliancePdf(Request $r): Response
    {
        $this->checkPermission('reports.view');
        return $this->pdf->render('gauge_compliance', $this->gauge->build($this->filters($r)));
    }

    public function faiStatusData(Request $r): JsonResponse
    {
        $this->checkPermission('reports.view');
        return response()->json($this->fai->build($this->filters($r)));
    }

    public function faiStatusPdf(Request $r): Response
    {
        $this->checkPermission('reports.view');
        return $this->pdf->render('fai_status', $this->fai->build($this->filters($r)));
    }

    public function managementReviewData(Request $r): JsonResponse
    {
        $this->checkPermission('reports.view');
        return response()->json($this->packet->build($this->filters($r)));
    }

    public function managementReviewPdf(Request $r): Response
    {
        $this->checkPermission('reports.view');
        return $this->pdf->render('management_review_packet', $this->packet->build($this->filters($r)));
    }

    /** Small JSON payload for the Dashboard chart tiles per doc §4.8. */
    public function dashboardTiles(Request $r): JsonResponse
    {
        $this->checkPermission('reports.view');
        $window = ['from' => now()->subDays(30)->toDateString(), 'to' => now()->toDateString()];

        return response()->json([
            'ncr_pareto_top' => array_slice($this->pareto->build($window)['rows'], 0, 5),
            'capa_kpi' => $this->capa->build($window)['kpi'],
            'gauge_kpi' => $this->gauge->build($window)['kpi'],
            'fai_kpi' => $this->fai->build($window)['kpi'],
        ]);
    }

    private function filters(Request $r): array
    {
        return array_filter([
            'from' => $r->query('from'),
            'to' => $r->query('to'),
            'customer_id' => $r->query('customer_id'),
            'part_id' => $r->query('part_id'),
            'status' => $r->query('status'),
        ], fn ($v) => $v !== null && $v !== '');
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
