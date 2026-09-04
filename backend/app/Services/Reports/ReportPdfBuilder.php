<?php

namespace App\Services\Reports;

use Illuminate\Http\Response;
use Illuminate\Support\Facades\View;
use Mpdf\Mpdf;

/**
 * Renders any of the 5 report payloads to a PDF via mPDF + a Blade
 * template under resources/views/reports/*. Layout stays consistent
 * across reports (company header band, filters, generated timestamp,
 * page numbers) so a stack of them still looks like one system.
 */
class ReportPdfBuilder
{
    private const TEMPLATE_MAP = [
        'ncr_pareto' => 'reports.ncr_pareto',
        'capa_summary' => 'reports.capa_summary',
        'gauge_compliance' => 'reports.gauge_compliance',
        'fai_status' => 'reports.fai_status',
        'management_review_packet' => 'reports.management_review_packet',
    ];

    public function render(string $reportKey, array $data): Response
    {
        if (! isset(self::TEMPLATE_MAP[$reportKey])) {
            abort(500, "Unknown report template: {$reportKey}");
        }

        $tenantName = optional(tenant())->name ?? 'FAI Manager';
        $html = View::make(self::TEMPLATE_MAP[$reportKey], [
            'data' => $data,
            'tenant_name' => $tenantName,
        ])->render();

        $mpdf = new Mpdf([
            'mode' => 'utf-8',
            'format' => 'A4',
            'orientation' => 'L',
            'margin_left' => 12,
            'margin_right' => 12,
            'margin_top' => 15,
            'margin_bottom' => 12,
            'margin_header' => 5,
            'margin_footer' => 5,
            'tempDir' => storage_path('app/mpdf-tmp'),
        ]);

        $mpdf->SetTitle($data['title'] ?? 'FAI Report');
        $mpdf->SetHTMLHeader('<div style="text-align:right; font-size:8pt; color:#666;">'
            . e($tenantName) . ' · ' . e($data['title'] ?? '') . '</div>');
        $mpdf->SetHTMLFooter('<div style="text-align:right; font-size:8pt; color:#999;">Page {PAGENO} of {nbpg}</div>');

        $mpdf->WriteHTML($html);

        $filename = $reportKey . '_' . now()->format('Ymd_His') . '.pdf';
        $binary = $mpdf->Output($filename, 'S');

        return response($binary, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
            'Cache-Control' => 'private, max-age=0',
        ]);
    }
}
