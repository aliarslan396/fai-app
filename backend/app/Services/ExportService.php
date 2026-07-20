<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\CustomInspectionReport;
use App\Models\FaiForm1;
use App\Models\TenantUser;
use App\Services\Export\As9102ExcelBuilder;
use App\Services\Export\As9102PdfBuilder;
use App\Services\Export\CustomReportPdfBuilder;
use App\Services\Export\ExportNotImplementedException;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Generates and stores customer-ready export artifacts.
 *
 * Every method returns a storage-relative path under the `exports/`
 * prefix and records an AuditLog entry — aerospace auditors ask
 * "who exported what, when" and every download must have a paper trail.
 *
 * Actual PhpSpreadsheet / mPDF rendering lands per Week 14 day plan:
 *   Day 2: AS9102 Excel — Form 1 + Form 2 tabs
 *   Day 3: AS9102 Excel — Form 3 + Signatures tabs
 *   Day 4: DEF-QA-003 PDF
 *   Day 5: AS9102 PDF variant
 */
class ExportService
{
    private const EXPORT_DISK = 'local';
    private const EXPORT_PREFIX = 'exports';

    public function __construct(
        private As9102ExcelBuilder $as9102Excel,
        private As9102PdfBuilder $as9102Pdf,
        private CustomReportPdfBuilder $customReportPdf,
    ) {}

    public function exportAs9102Excel(FaiForm1 $form, TenantUser $user): string
    {
        $this->assertReadable($form);
        $bytes = $this->as9102Excel->build($form);

        return $this->persist(
            $bytes,
            'AS9102-' . ($form->fai_number ?? "form-{$form->id}"),
            'xlsx',
            FaiForm1::class,
            $form->id,
            $user,
        );
    }

    public function exportAs9102Pdf(FaiForm1 $form, TenantUser $user): string
    {
        $this->assertReadable($form);
        $bytes = $this->as9102Pdf->build($form);

        return $this->persist(
            $bytes,
            'AS9102-' . ($form->fai_number ?? "form-{$form->id}"),
            'pdf',
            FaiForm1::class,
            $form->id,
            $user,
        );
    }

    public function exportCustomReportPdf(CustomInspectionReport $report, TenantUser $user): string
    {
        $this->assertReadable($report);
        $bytes = $this->customReportPdf->build($report);

        return $this->persist(
            $bytes,
            'InspectionReport-' . ($report->ir_number ?? "report-{$report->id}"),
            'pdf',
            CustomInspectionReport::class,
            $report->id,
            $user,
        );
    }

    /**
     * Persist rendered bytes to storage under a versioned filename and
     * emit the audit-log entry the aerospace paper trail requires.
     */
    protected function persist(
        string $bytes,
        string $filenameStem,
        string $extension,
        string $subject_type,
        int $subject_id,
        TenantUser $user,
    ): string {
        $timestamp = now()->format('Ymd-His');
        $safeStem = preg_replace('/[^A-Za-z0-9._-]/', '_', $filenameStem);
        $relative = self::EXPORT_PREFIX . "/{$safeStem}-{$timestamp}-" . Str::random(6) . ".{$extension}";

        Storage::disk(self::EXPORT_DISK)->put($relative, $bytes);

        AuditLog::record('export.generated', [
            'subject_type' => $subject_type,
            'subject_id' => $subject_id,
            'meta' => [
                'file' => $relative,
                'extension' => $extension,
                'user_id' => $user->id,
                'bytes' => strlen($bytes),
            ],
        ]);

        return $relative;
    }

    /**
     * Placeholder guard — Day 5 fills in per-form checks if any beyond
     * the controller-level `inspections.export` permission.
     */
    protected function assertReadable(object $subject): void
    {
        // no-op for now
    }
}
