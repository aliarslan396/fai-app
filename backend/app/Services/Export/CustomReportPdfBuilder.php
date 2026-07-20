<?php

namespace App\Services\Export;

use App\Models\CustomInspectionReport;
use Illuminate\Support\Facades\Storage;
use Mpdf\Config\ConfigVariables;
use Mpdf\Config\FontVariables;
use Mpdf\Mpdf;
use RuntimeException;

/**
 * Renders the Custom Inspection Report (DEF-QA-003 and any tenant-defined
 * template) as a PDF using mPDF.
 *
 * mPDF is chosen because it supports:
 *   - Unicode glyphs (⌀ ⊥ ⌭ ⊕ ∅ …) required for GD&T rendering — needs
 *     DejaVu TTF baked into the Docker image, added in Day 1.
 *   - PNG embedding for the drawn signature + auto-generated QA stamp
 *   - CSS-based styling so the layout code stays readable instead of
 *     being an imperative sea of cell coordinates like PhpSpreadsheet
 *
 * Data preload happens once at build() time to keep every render_html
 * call cheap and pure. Missing image files are silently skipped so a
 * broken storage entry never blows up the whole export.
 */
class CustomReportPdfBuilder
{
    public function build(CustomInspectionReport $report): string
    {
        $report->loadMissing([
            'template',
            'part.customer',
            'plan',
            'rows',
            'signatures.user:id,name,email,cert_number,signature_role_title',
        ]);

        $mpdf = $this->makeMpdf();

        $mpdf->SetTitle($report->template?->header_title ?? 'Inspection Report');
        $mpdf->SetAuthor('FAI Manager');
        $mpdf->SetCreator('FAI Manager Export Service');
        $mpdf->SetSubject('Inspection Report: ' . ($report->ir_number ?? "id-{$report->id}"));

        $primary = $report->template?->primary_color ?? '#1F3B6E';
        $mpdf->SetHTMLHeader($this->renderHeader($report, $primary));
        $mpdf->SetHTMLFooter($this->renderFooter($report));

        $mpdf->WriteHTML($this->renderCss($primary), \Mpdf\HTMLParserMode::HEADER_CSS);
        $mpdf->WriteHTML($this->renderBody($report), \Mpdf\HTMLParserMode::HTML_BODY);

        return $mpdf->Output('', \Mpdf\Output\Destination::STRING_RETURN);
    }

    private function makeMpdf(): Mpdf
    {
        // Merge DejaVu into the default font stack — provides the GD&T
        // glyphs (⌀, ⊥, etc.) that mPDF's bundled core fonts cannot render.
        $defaultConfig = (new ConfigVariables())->getDefaults();
        $defaultFontConfig = (new FontVariables())->getDefaults();

        $fontDirs = $defaultConfig['fontDir'];
        $fontData = $defaultFontConfig['fontdata'];

        $extraFontDirs = array_values(array_filter([
            '/usr/share/fonts/dejavu',
            '/usr/share/fonts/truetype/dejavu',
        ], 'is_dir'));

        $fontData['dejavusans'] = [
            'R' => 'DejaVuSans.ttf',
            'B' => 'DejaVuSans-Bold.ttf',
            'I' => 'DejaVuSans-Oblique.ttf',
            'BI' => 'DejaVuSans-BoldOblique.ttf',
        ];

        return new Mpdf([
            'mode' => 'utf-8',
            'format' => 'A4',
            'margin_left' => 12,
            'margin_right' => 12,
            'margin_top' => 26,
            'margin_bottom' => 22,
            'margin_header' => 8,
            'margin_footer' => 8,
            'default_font' => 'dejavusans',
            'default_font_size' => 9,
            'fontDir' => array_merge($fontDirs, $extraFontDirs),
            'fontdata' => $fontData,
            'tempDir' => storage_path('app/mpdf-tmp'),
        ]);
    }

    private function renderCss(string $primary): string
    {
        return <<<CSS
        <style>
        body { font-family: dejavusans, sans-serif; color: #1a1a1a; }
        h1, h2, h3 { color: {$primary}; margin: 0 0 6pt 0; }
        h1 { font-size: 14pt; font-weight: bold; }
        h2 { font-size: 11pt; font-weight: bold; border-bottom: 1pt solid {$primary}; padding-bottom: 2pt; margin-top: 10pt; }
        h3 { font-size: 10pt; font-weight: bold; margin-top: 8pt; }
        table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
        table.header-grid td { padding: 3pt 5pt; border: 0.4pt solid #999; }
        table.header-grid td.label { background: #e8eef7; font-weight: bold; width: 20%; }
        table.chars { margin-top: 4pt; }
        table.chars th { background: {$primary}; color: white; padding: 4pt 3pt; border: 0.4pt solid #666; font-weight: bold; font-size: 8pt; text-align: center; }
        table.chars td { padding: 3pt; border: 0.4pt solid #999; vertical-align: top; }
        table.chars tr.pass td { background: #dff2e1; }
        table.chars tr.fail td { background: #fbe3e4; }
        table.chars td.pf { text-align: center; font-weight: bold; }
        table.chars td.idx { text-align: center; width: 4%; }
        .summary-bar { background: #d5deea; padding: 5pt; text-align: center; font-weight: bold; margin-top: 6pt; font-size: 9pt; border: 0.4pt solid #999; }
        .statement { background: #f7f7f7; padding: 6pt 8pt; border-left: 3pt solid {$primary}; margin: 10pt 0 8pt 0; font-style: italic; font-size: 9pt; }
        .sig-block { border: 0.4pt solid #ccc; padding: 6pt; margin-bottom: 6pt; page-break-inside: avoid; }
        .sig-block .sig-head { background: #e8eef7; padding: 3pt 5pt; margin: -6pt -6pt 6pt -6pt; font-weight: bold; font-size: 9pt; }
        .sig-block .sig-images td { padding: 4pt; vertical-align: middle; border: 0.4pt dashed #ddd; text-align: center; }
        .sig-block .sig-images img { max-height: 70pt; }
        .sig-block .sig-meta { margin-top: 4pt; font-size: 8pt; color: #555; }
        .empty { color: #888; font-style: italic; padding: 8pt; text-align: center; }
        </style>
        CSS;
    }

    private function renderHeader(CustomInspectionReport $report, string $primary): string
    {
        $title = e($report->template?->header_title ?? 'Inspection Report');
        $doc = e($report->template?->doc_number ?? '—');
        $rev = e($report->template?->revision ?? '—');
        $ir = e($report->ir_number ?? '—');

        return <<<HTML
        <table style="width:100%; border-bottom: 1pt solid {$primary}; padding-bottom: 4pt;">
            <tr>
                <td style="font-size:12pt; font-weight:bold; color:{$primary};">{$title}</td>
                <td style="text-align:right; font-size:8pt; color:#555;">
                    <b>Doc:</b> {$doc} Rev {$rev} &nbsp; · &nbsp; <b>IR:</b> {$ir}
                </td>
            </tr>
        </table>
        HTML;
    }

    private function renderFooter(CustomInspectionReport $report): string
    {
        $ir = e($report->ir_number ?? '—');
        $generated = now()->format('Y-m-d H:i \U\T\C');

        return <<<HTML
        <table style="width:100%; font-size:7.5pt; color:#666; border-top: 0.4pt solid #ccc; padding-top: 3pt;">
            <tr>
                <td>Report {$ir} · Generated {$generated}</td>
                <td style="text-align:right;">Page {PAGENO} of {nbpg}</td>
            </tr>
        </table>
        HTML;
    }

    private function renderBody(CustomInspectionReport $report): string
    {
        $html = '<h1>' . e($report->report_title ?: $report->template?->header_title ?: 'Inspection Report') . '</h1>';
        $html .= $this->renderHeaderTable($report);
        $html .= $this->renderCharacteristicsTable($report);
        $html .= $this->renderSummary($report);
        $html .= $this->renderSignaturesSection($report);

        return $html;
    }

    private function renderHeaderTable(CustomInspectionReport $report): string
    {
        $customerName = e($report->part?->customer?->name ?? '—');
        $rows = [
            ['Part Number', e($report->part_number ?? '—'), 'Serial / Lot', e($report->serial_lot_number ?? '—')],
            ['Part Name', e($report->part_name ?? '—'), 'Revision', e($report->revision ?? '—')],
            ['Quantity', e((string) ($report->quantity ?? '—')), 'Work Order', e($report->work_order ?? '—')],
            ['Customer', $customerName, 'Inspection Type', e($report->inspection_type ?? '—')],
            ['Prepared By', e($report->prepared_by_name ?? $report->inspector_name ?? '—'), 'Prepared At', $report->prepared_at?->format('Y-m-d H:i') ?? '—'],
        ];

        $body = '';
        foreach ($rows as [$labelL, $valueL, $labelR, $valueR]) {
            $body .= "<tr><td class=\"label\">{$labelL}</td><td>{$valueL}</td><td class=\"label\">{$labelR}</td><td>{$valueR}</td></tr>";
        }

        return '<h2>Report Details</h2><table class="header-grid">' . $body . '</table>';
    }

    private function renderCharacteristicsTable(CustomInspectionReport $report): string
    {
        $rows = $report->rows ?? collect();

        $html = '<h2>Characteristic Verification</h2>';

        if ($rows->isEmpty()) {
            return $html . '<div class="empty">No characteristics recorded.</div>';
        }

        $html .= '<table class="chars"><thead><tr>';
        $headers = ['#', 'Char #', 'Reference', 'Designator', 'Requirement', 'Result', 'QA', 'Pass/Fail', 'NCR #', 'Comments'];
        foreach ($headers as $h) {
            $html .= '<th>' . e($h) . '</th>';
        }
        $html .= '</tr></thead><tbody>';

        foreach ($rows as $idx => $r) {
            $verdict = strtolower((string) $r->pass_fail);
            $rowClass = in_array($verdict, ['pass', 'fail'], true) ? $verdict : '';
            $verdictText = $verdict ? strtoupper($verdict) : '—';

            $html .= "<tr class=\"{$rowClass}\">"
                . '<td class="idx">' . ($idx + 1) . '</td>'
                . '<td>' . e($r->field5_char_number ?? (string) $r->balloon_number) . '</td>'
                . '<td>' . e($r->field6_reference_location ?? '') . '</td>'
                . '<td>' . e($r->field7_char_designator ?? '') . '</td>'
                . '<td>' . e($r->field8_requirement ?? '') . '</td>'
                . '<td>' . e($r->field9_results ?? '') . '</td>'
                . '<td>' . e($r->field10_qa_acceptance ?? '') . '</td>'
                . '<td class="pf">' . e($verdictText) . '</td>'
                . '<td>' . e($r->field11_ncr_number ?? '') . '</td>'
                . '<td>' . e($r->field14_comments ?? '') . '</td>'
                . '</tr>';
        }

        return $html . '</tbody></table>';
    }

    private function renderSummary(CustomInspectionReport $report): string
    {
        $rows = $report->rows ?? collect();
        if ($rows->isEmpty()) {
            return '';
        }

        $pass = $rows->filter(fn ($r) => strtolower((string) $r->pass_fail) === 'pass')->count();
        $fail = $rows->filter(fn ($r) => strtolower((string) $r->pass_fail) === 'fail')->count();
        $ncrs = $rows->filter(fn ($r) => ! empty($r->field11_ncr_number))->count();

        return sprintf(
            '<div class="summary-bar">Total: %d &nbsp; · &nbsp; Pass: %d &nbsp; · &nbsp; Fail: %d &nbsp; · &nbsp; NCRs recorded: %d</div>',
            $rows->count(),
            $pass,
            $fail,
            $ncrs,
        );
    }

    private function renderSignaturesSection(CustomInspectionReport $report): string
    {
        $signatures = $report->signatures ?? collect();

        $statement = $report->template?->signature_statement;
        $html = '<h2>Signatures &amp; Authentication</h2>';

        if (! empty($statement)) {
            $html .= '<div class="statement">' . e($statement) . '</div>';
        }

        if ($signatures->isEmpty()) {
            return $html . '<div class="empty">Report is unsigned. No signatures on record.</div>';
        }

        foreach ($signatures as $idx => $sig) {
            $number = $idx + 1;
            $name = e($sig->user?->name ?? '(unknown)');
            $role = e(ucwords(str_replace('_', ' ', $sig->signature_role ?? '')));
            $cert = e($sig->user?->cert_number ?? '—');
            $title = e($sig->user?->signature_role_title ?? '—');
            $signedAt = e($sig->signed_at?->format('Y-m-d H:i \U\T\C') ?? '—');
            $ip = e($sig->ip_address ?? '—');

            $sigImg = $this->imageTag($sig->signature_image_path, 'Signature');
            $stampImg = $this->imageTag($sig->stamp_image_path, 'QA Stamp');

            $html .= <<<HTML
            <div class="sig-block">
                <div class="sig-head">#{$number} &nbsp; {$name} &nbsp; · &nbsp; {$role} &nbsp; · &nbsp; {$signedAt}</div>
                <table class="sig-images"><tr>
                    <td width="50%">{$sigImg}</td>
                    <td width="50%">{$stampImg}</td>
                </tr></table>
                <div class="sig-meta">
                    Cert #: <b>{$cert}</b> &nbsp; · &nbsp; Title: <b>{$title}</b> &nbsp; · &nbsp; Signed from IP: <b>{$ip}</b>
                </div>
            </div>
            HTML;
        }

        return $html;
    }

    private function imageTag(?string $relativePath, string $alt): string
    {
        if (empty($relativePath)) {
            return '<span style="color:#999;">— no image —</span>';
        }

        try {
            $absolute = Storage::disk('local')->path($relativePath);
        } catch (\Throwable) {
            return '<span style="color:#999;">— image unavailable —</span>';
        }

        if (! is_string($absolute) || ! file_exists($absolute)) {
            return '<span style="color:#999;">— image missing —</span>';
        }

        // Read bytes + base64-embed so mPDF doesn't need file-URL access
        // outside its allowed paths list.
        $mime = @mime_content_type($absolute) ?: 'image/png';
        $data = @file_get_contents($absolute);
        if ($data === false) {
            throw new RuntimeException("Failed to read image at {$absolute}");
        }
        $b64 = base64_encode($data);

        return sprintf(
            '<img src="data:%s;base64,%s" alt="%s" />',
            e($mime),
            $b64,
            e($alt),
        );
    }
}
