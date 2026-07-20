<?php

namespace App\Services\Export;

use App\Models\FaiForm1;
use Illuminate\Support\Facades\Storage;
use Mpdf\Config\ConfigVariables;
use Mpdf\Config\FontVariables;
use Mpdf\Mpdf;
use RuntimeException;

/**
 * PDF variant of the AS9102 4-form workbook — same content as the
 * PhpSpreadsheet Excel export but rendered by mPDF for customers who
 * prefer PDF (some Boeing supplier portals accept both).
 *
 * Structure mirrors the Excel:
 *   Section 1 — Form 1 Part Number Accountability
 *   Section 2 — Form 2 Product Accountability (materials + processes)
 *   Section 3 — Form 3 Characteristic Accountability (measurement grid)
 *   Section 4 — Signatures & Authentication (roster + embedded PNGs)
 *
 * Each section starts on a fresh page (page-break-before) so a
 * reviewer can print the four sheets separately if they want to.
 */
class As9102PdfBuilder
{
    public function build(FaiForm1 $form): string
    {
        $form->loadMissing([
            'part.customer',
            'plan',
            'form2.materials',
            'form3Rows',
            'signatures.user:id,name,email,cert_number,signature_role_title',
        ]);

        $mpdf = $this->makeMpdf();

        $faiNumber = $form->fai_number ?? "form-{$form->id}";
        $mpdf->SetTitle('AS9102 FAI ' . $faiNumber);
        $mpdf->SetAuthor('FAI Manager');
        $mpdf->SetCreator('FAI Manager Export Service');
        $mpdf->SetSubject('AS9102 First Article Inspection Report');
        $mpdf->SetKeywords('AS9102 FAI aerospace');

        $mpdf->SetHTMLHeader($this->renderHeader($form));
        $mpdf->SetHTMLFooter($this->renderFooter($form));

        $mpdf->WriteHTML($this->renderCss(), \Mpdf\HTMLParserMode::HEADER_CSS);
        $mpdf->WriteHTML($this->renderBody($form), \Mpdf\HTMLParserMode::HTML_BODY);

        return $mpdf->Output('', \Mpdf\Output\Destination::STRING_RETURN);
    }

    private function makeMpdf(): Mpdf
    {
        $defaultConfig = (new ConfigVariables())->getDefaults();
        $defaultFontConfig = (new FontVariables())->getDefaults();

        $fontDirs = $defaultConfig['fontDir'];
        $fontData = $defaultFontConfig['fontdata'];

        $extraFontDirs = array_values(array_filter([
            '/usr/share/fonts/dejavu',
            '/usr/share/fonts/truetype/dejavu',
        ], 'is_dir'));

        return new Mpdf([
            'mode' => 'utf-8',
            'format' => 'A4',
            'orientation' => 'L', // landscape — Form 3 has 10 columns
            'margin_left' => 10,
            'margin_right' => 10,
            'margin_top' => 22,
            'margin_bottom' => 20,
            'margin_header' => 6,
            'margin_footer' => 6,
            'default_font' => 'dejavusans',
            'default_font_size' => 8.5,
            'fontDir' => array_merge($fontDirs, $extraFontDirs),
            'fontdata' => $fontData,
            'tempDir' => storage_path('app/mpdf-tmp'),
        ]);
    }

    private function renderCss(): string
    {
        return <<<'CSS'
        <style>
        body { font-family: dejavusans, sans-serif; color: #1a1a1a; }
        .section { page-break-before: always; }
        .section:first-child { page-break-before: auto; }
        h1 { font-size: 12pt; color: #1F3B6E; margin: 0 0 6pt 0; padding: 5pt; background: #1F3B6E; color: white; text-align: center; }
        h2 { font-size: 10pt; color: #1F3B6E; margin: 8pt 0 4pt 0; border-bottom: 1pt solid #1F3B6E; padding-bottom: 2pt; }
        table { width: 100%; border-collapse: collapse; font-size: 8pt; }
        table.grid td { padding: 3pt 5pt; border: 0.4pt solid #999; vertical-align: top; }
        table.grid td.label { background: #e8eef7; font-weight: bold; width: 20%; }
        table.grid td.section-h { background: #d5deea; font-weight: bold; padding: 4pt 5pt; text-align: left; }
        table.chars th { background: #1F3B6E; color: white; padding: 4pt 3pt; border: 0.4pt solid #666; font-weight: bold; font-size: 7.5pt; text-align: center; }
        table.chars td { padding: 3pt; border: 0.4pt solid #999; vertical-align: top; font-size: 7.5pt; }
        table.chars tr.pass td { background: #dff2e1; }
        table.chars tr.fail td { background: #fbe3e4; }
        table.chars td.pf { text-align: center; font-weight: bold; }
        table.chars td.idx { text-align: center; }
        .summary-bar { background: #d5deea; padding: 5pt; text-align: center; font-weight: bold; margin-top: 6pt; font-size: 9pt; border: 0.4pt solid #999; }
        .sig-block { border: 0.4pt solid #ccc; padding: 6pt; margin-bottom: 6pt; page-break-inside: avoid; }
        .sig-block .sig-head { background: #e8eef7; padding: 3pt 5pt; margin: -6pt -6pt 6pt -6pt; font-weight: bold; font-size: 9pt; }
        .sig-block .sig-images td { padding: 4pt; vertical-align: middle; border: 0.4pt dashed #ddd; text-align: center; }
        .sig-block .sig-images img { max-height: 70pt; }
        .sig-block .sig-meta { margin-top: 4pt; font-size: 8pt; color: #555; }
        .empty { color: #888; font-style: italic; padding: 8pt; text-align: center; }
        </style>
        CSS;
    }

    private function renderHeader(FaiForm1 $form): string
    {
        $fai = e($form->fai_number ?? '—');
        $fair = e($form->field4_fair_identifier ?? '—');

        return <<<HTML
        <table style="width:100%; border-bottom: 1pt solid #1F3B6E; padding-bottom: 3pt;">
            <tr>
                <td style="font-size:10pt; font-weight:bold; color:#1F3B6E;">AS9102 REV C — FIRST ARTICLE INSPECTION REPORT</td>
                <td style="text-align:right; font-size:7.5pt; color:#555;">
                    <b>FAI:</b> {$fai} &nbsp; · &nbsp; <b>FAIR:</b> {$fair}
                </td>
            </tr>
        </table>
        HTML;
    }

    private function renderFooter(FaiForm1 $form): string
    {
        $fai = e($form->fai_number ?? '—');
        $generated = now()->format('Y-m-d H:i \U\T\C');

        return <<<HTML
        <table style="width:100%; font-size:7pt; color:#666; border-top: 0.4pt solid #ccc; padding-top: 3pt;">
            <tr>
                <td>AS9102 FAI {$fai} · Generated {$generated}</td>
                <td style="text-align:right;">Page {PAGENO} of {nbpg}</td>
            </tr>
        </table>
        HTML;
    }

    private function renderBody(FaiForm1 $form): string
    {
        $html = '<div class="section">';
        $html .= $this->renderForm1Section($form);
        $html .= '</div>';

        $html .= '<div class="section">';
        $html .= $this->renderForm2Section($form);
        $html .= '</div>';

        $html .= '<div class="section">';
        $html .= $this->renderForm3Section($form);
        $html .= '</div>';

        $html .= '<div class="section">';
        $html .= $this->renderSignaturesSection($form);
        $html .= '</div>';

        return $html;
    }

    private function renderForm1Section(FaiForm1 $form): string
    {
        $html = '<h1>FORM 1 — PART NUMBER ACCOUNTABILITY</h1>';
        $html .= '<table class="grid">';

        $rows = [
            ['1. Part Number', $form->field1_part_number, '2. Part Name', $form->field2_part_name],
            ['3. Serial Number', $form->field3_serial_number, '4. FAIR Identifier', $form->field4_fair_identifier],
            ['5. Part Revision Level', $form->field5_part_revision, '6. Drawing Number', $form->field6_drawing_number],
            ['7. Drawing Revision Level', $form->field7_drawing_revision, '8. Additional Changes', $form->field8_additional_changes],
        ];
        $html .= '<tr><td colspan="4" class="section-h">1–8 Part Identification</td></tr>';
        foreach ($rows as [$l1, $v1, $l2, $v2]) {
            $html .= sprintf(
                '<tr><td class="label">%s</td><td>%s</td><td class="label">%s</td><td>%s</td></tr>',
                e($l1), e($v1 ?? ''), e($l2), e($v2 ?? '')
            );
        }

        $rows = [
            ['9. Mfg Process Reference', $form->field9_mfg_process_ref, '10. Organization Name', $form->field10_org_name],
            ['11. Supplier Code', $form->field11_supplier_code, '12. PO Number', $form->field12_po_number],
            ['13. Detail or Assembly', $form->field13_detail_or_assembly, '', ''],
        ];
        $html .= '<tr><td colspan="4" class="section-h">9–13 Program &amp; Supplier</td></tr>';
        foreach ($rows as [$l1, $v1, $l2, $v2]) {
            $html .= sprintf(
                '<tr><td class="label">%s</td><td>%s</td><td class="label">%s</td><td>%s</td></tr>',
                e($l1), e($v1 ?? ''), e($l2), e($v2 ?? '')
            );
        }

        $html .= '<tr><td colspan="4" class="section-h">14 FAI Type</td></tr>';
        $html .= sprintf(
            '<tr><td class="label">14a. Full or Partial</td><td>%s</td><td class="label">14b. Baseline Part Number</td><td>%s</td></tr>',
            e($form->field14_fai_type ?? ''),
            e($form->field14_baseline_part_number ?? '')
        );
        $html .= sprintf(
            '<tr><td class="label">14c. Partial Reason</td><td colspan="3">%s</td></tr>',
            e($form->field14_partial_reason ?? '')
        );

        $html .= '<tr><td colspan="4" class="section-h">19 Nonconformance</td></tr>';
        $html .= sprintf(
            '<tr><td class="label">19. Non-conformance present?</td><td colspan="3">%s</td></tr>',
            $form->field19_has_nonconformance ? 'YES' : 'NO'
        );

        $html .= '<tr><td colspan="4" class="section-h">20–25 Signatures &amp; Reviews</td></tr>';
        $sigRows = [
            ['20. Verified By', $form->field20_verified_by_name, '21. Verified At', optional($form->field21_verified_at)?->format('Y-m-d H:i')],
            ['22. Reviewed By', $form->field22_reviewed_by_name, '23. Reviewed At', optional($form->field23_reviewed_at)?->format('Y-m-d H:i')],
            ['24. Customer Approval', $form->field24_customer_approval_name, '25. Customer Approved At', optional($form->field25_customer_approval_at)?->format('Y-m-d H:i')],
        ];
        foreach ($sigRows as [$l1, $v1, $l2, $v2]) {
            $html .= sprintf(
                '<tr><td class="label">%s</td><td>%s</td><td class="label">%s</td><td>%s</td></tr>',
                e($l1), e($v1 ?? ''), e($l2), e($v2 ?? '')
            );
        }

        $html .= '<tr><td colspan="4" class="section-h">26 Comments</td></tr>';
        $html .= sprintf(
            '<tr><td colspan="4" style="min-height:40pt;">%s</td></tr>',
            nl2br(e($form->field26_comments ?? ''))
        );

        return $html . '</table>';
    }

    private function renderForm2Section(FaiForm1 $form): string
    {
        $html = '<h1>FORM 2 — PRODUCT ACCOUNTABILITY</h1>';

        $html .= '<table class="grid"><tr>'
            . '<td class="label">1. Part Number</td><td>' . e($form->field1_part_number ?? '') . '</td>'
            . '<td class="label">2. Part Name</td><td>' . e($form->field2_part_name ?? '') . '</td></tr><tr>'
            . '<td class="label">3. Serial Number</td><td>' . e($form->field3_serial_number ?? '') . '</td>'
            . '<td class="label">4. FAIR Identifier</td><td>' . e($form->field4_fair_identifier ?? '') . '</td></tr></table>';

        $html .= '<h2>5–10 Materials, Processes, and Inspections</h2>';

        $materials = $form->form2?->materials ?? collect();

        if ($materials->isEmpty()) {
            $html .= '<div class="empty">No materials or processes recorded.</div>';
        } else {
            $html .= '<table class="chars"><thead><tr>'
                . '<th>#</th><th>5. Material / Process</th><th>6. Spec Number</th>'
                . '<th>7. Code</th><th>8. Supplier</th><th>9. Customer Approval</th><th>10. CoC Number</th>'
                . '</tr></thead><tbody>';

            foreach ($materials as $idx => $mat) {
                $html .= '<tr>'
                    . '<td class="idx">' . ($idx + 1) . '</td>'
                    . '<td>' . e($mat->field5_material_name ?? '') . '</td>'
                    . '<td>' . e($mat->field6_spec_number ?? '') . '</td>'
                    . '<td>' . e($mat->field7_code ?? '') . '</td>'
                    . '<td>' . e($mat->field8_supplier ?? '') . '</td>'
                    . '<td>' . e($mat->field9_customer_approval ?? '') . '</td>'
                    . '<td>' . e($mat->field10_coc_number ?? '') . '</td>'
                    . '</tr>';
            }
            $html .= '</tbody></table>';
        }

        $html .= '<h2>11–13 Test Procedures &amp; Comments</h2>';
        $html .= '<table class="grid">'
            . '<tr><td class="label">11. Functional Test Procedure</td><td>' . e($form->form2?->field11_functional_test_procedure ?? '') . '</td></tr>'
            . '<tr><td class="label">12. Acceptance Report Number</td><td>' . e($form->form2?->field12_acceptance_report_number ?? '') . '</td></tr>'
            . '<tr><td class="label">13. Comments</td><td style="min-height:30pt;">' . nl2br(e($form->form2?->field13_comments ?? '')) . '</td></tr>'
            . '</table>';

        return $html;
    }

    private function renderForm3Section(FaiForm1 $form): string
    {
        $html = '<h1>FORM 3 — CHARACTERISTIC ACCOUNTABILITY, VERIFICATION AND COMPATIBILITY EVALUATION</h1>';

        $html .= '<table class="grid" style="margin-bottom:6pt;"><tr>'
            . '<td class="label">Part Number</td><td>' . e($form->field1_part_number ?? '') . '</td>'
            . '<td class="label">Serial Number</td><td>' . e($form->field3_serial_number ?? '') . '</td>'
            . '<td class="label">FAIR ID</td><td>' . e($form->field4_fair_identifier ?? '') . '</td>'
            . '</tr></table>';

        $rows = $form->form3Rows ?? collect();

        if ($rows->isEmpty()) {
            $html .= '<div class="empty">No characteristics recorded.</div>';

            return $html;
        }

        $html .= '<table class="chars"><thead><tr>'
            . '<th>#</th><th>5. Char #</th><th>6. Reference</th><th>7. Designator</th>'
            . '<th style="width:22%;">8. Requirement</th><th>9. Result</th><th>10. Tooling</th>'
            . '<th>Pass/Fail</th><th>11. NCR #</th><th>14. Comments</th>'
            . '</tr></thead><tbody>';

        $pass = 0;
        $fail = 0;
        $ncrs = 0;

        foreach ($rows as $idx => $r) {
            $verdict = strtolower((string) $r->pass_fail);
            $rowClass = in_array($verdict, ['pass', 'fail'], true) ? $verdict : '';
            if ($verdict === 'pass') {
                $pass++;
            }
            if ($verdict === 'fail') {
                $fail++;
            }
            if (! empty($r->field11_nonconformance_number)) {
                $ncrs++;
            }

            $html .= "<tr class=\"{$rowClass}\">"
                . '<td class="idx">' . ($idx + 1) . '</td>'
                . '<td>' . e($r->field5_char_number ?? (string) $r->balloon_number) . '</td>'
                . '<td>' . e($r->field6_reference_location ?? '') . '</td>'
                . '<td>' . e($r->field7_char_designator ?? '') . '</td>'
                . '<td>' . e($r->field8_requirement ?? '') . '</td>'
                . '<td>' . e($r->field9_results ?? '') . '</td>'
                . '<td>' . e($r->field10_qualified_tooling ?? '') . '</td>'
                . '<td class="pf">' . e($verdict ? strtoupper($verdict) : '—') . '</td>'
                . '<td>' . e($r->field11_nonconformance_number ?? '') . '</td>'
                . '<td>' . e($r->field14_additional_comments ?? '') . '</td>'
                . '</tr>';
        }

        $html .= '</tbody></table>';

        $html .= sprintf(
            '<div class="summary-bar">Total: %d &nbsp;·&nbsp; Pass: %d &nbsp;·&nbsp; Fail: %d &nbsp;·&nbsp; NCRs recorded: %d</div>',
            $rows->count(),
            $pass,
            $fail,
            $ncrs,
        );

        return $html;
    }

    private function renderSignaturesSection(FaiForm1 $form): string
    {
        $signatures = $form->signatures ?? collect();

        $html = '<h1>SIGNATURES &amp; AUTHENTICATION</h1>';

        if ($signatures->isEmpty()) {
            return $html . '<div class="empty">Form is unsigned. No signatures on record.</div>';
        }

        // Roster overview
        $html .= '<h2>Signer Roster</h2>';
        $html .= '<table class="chars"><thead><tr>'
            . '<th>#</th><th>Signed By</th><th>Role</th><th>Cert #</th>'
            . '<th>Signature Title</th><th>Signed At (UTC)</th><th>IP Address</th>'
            . '</tr></thead><tbody>';

        foreach ($signatures as $idx => $sig) {
            $html .= '<tr>'
                . '<td class="idx">' . ($idx + 1) . '</td>'
                . '<td>' . e($sig->user?->name ?? '(unknown)') . '</td>'
                . '<td>' . e(ucwords(str_replace('_', ' ', $sig->signature_role ?? ''))) . '</td>'
                . '<td>' . e($sig->user?->cert_number ?? '—') . '</td>'
                . '<td>' . e($sig->user?->signature_role_title ?? '—') . '</td>'
                . '<td>' . e($sig->signed_at?->format('Y-m-d H:i') ?? '—') . '</td>'
                . '<td>' . e($sig->ip_address ?? '—') . '</td>'
                . '</tr>';
        }
        $html .= '</tbody></table>';

        // Per-signer image blocks
        $html .= '<h2>Signature Images</h2>';
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
