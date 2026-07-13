<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\CustomInspectionReport;
use App\Models\FaiForm1;
use App\Services\Export\ExportNotImplementedException;
use App\Services\ExportService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Streams generated export artifacts (Excel / PDF) back to the browser.
 *
 * One route per (form-type, format) so the URL itself communicates
 * intent — `/api/v1/exports/as9102-excel/{id}` is unambiguous vs a
 * generic type+format combo that has to be parsed.
 *
 * Body implementations are stubbed via ExportService until the day
 * they are built (Week 14 Day 2-5).
 */
class ExportController extends Controller
{
    public function __construct(private ExportService $service) {}

    public function as9102Excel(Request $request, int $formId): Response|BinaryFileResponse
    {
        return $this->stream(function () use ($request, $formId) {
            $form = FaiForm1::findOrFail($formId);

            return [
                $this->service->exportAs9102Excel($form, $request->user()),
                $this->as9102ExcelFilename($form),
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ];
        });
    }

    public function as9102Pdf(Request $request, int $formId): Response|BinaryFileResponse
    {
        return $this->stream(function () use ($request, $formId) {
            $form = FaiForm1::findOrFail($formId);

            return [
                $this->service->exportAs9102Pdf($form, $request->user()),
                $this->as9102PdfFilename($form),
                'application/pdf',
            ];
        });
    }

    public function customReportPdf(Request $request, int $reportId): Response|BinaryFileResponse
    {
        return $this->stream(function () use ($request, $reportId) {
            $report = CustomInspectionReport::findOrFail($reportId);

            return [
                $this->service->exportCustomReportPdf($report, $request->user()),
                $this->customReportFilename($report),
                'application/pdf',
            ];
        });
    }

    private function stream(callable $build): Response|BinaryFileResponse
    {
        $this->checkPermission('inspections.export');

        try {
            [$relative, $downloadName, $mime] = $build();
        } catch (ExportNotImplementedException $e) {
            abort(501, $e->getMessage());
        }

        $path = Storage::disk('local')->path($relative);
        if (! file_exists($path)) {
            abort(404, 'Export file missing after generation.');
        }

        return response()->download($path, $downloadName, [
            'Content-Type' => $mime,
            'Cache-Control' => 'private, no-store',
        ]);
    }

    private function as9102ExcelFilename(FaiForm1 $form): string
    {
        return 'AS9102-' . $this->safe($form->fai_number ?? "form-{$form->id}") . '.xlsx';
    }

    private function as9102PdfFilename(FaiForm1 $form): string
    {
        return 'AS9102-' . $this->safe($form->fai_number ?? "form-{$form->id}") . '.pdf';
    }

    private function customReportFilename(CustomInspectionReport $report): string
    {
        return 'InspectionReport-' . $this->safe($report->ir_number ?? "report-{$report->id}") . '.pdf';
    }

    private function safe(string $value): string
    {
        return preg_replace('/[^A-Za-z0-9._-]/', '_', $value);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
