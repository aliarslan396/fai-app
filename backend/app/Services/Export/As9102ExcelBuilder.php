<?php

namespace App\Services\Export;

use App\Models\FaiForm1;
use App\Models\Signature;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Drawing;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Renders an AS9102 Rev C compliant 4-tab workbook for a signed FAI.
 *
 * Tab layout (per AS9102 spec):
 *   1. Form 1 — Part Number Accountability (26 numbered fields)
 *   2. Form 2 — Product Accountability (materials + processes)
 *   3. Form 3 — Characteristic Accountability (measurement grid)
 *   4. Signatures — signer roster + embedded stamp / sig PNGs
 */
class As9102ExcelBuilder
{
    private const HEADER_FILL = 'FFE8EEF7';
    private const SECTION_FILL = 'FFD5DEEA';
    private const PASS_FILL = 'FFDFF2E1';
    private const FAIL_FILL = 'FFFBE3E4';

    public function build(FaiForm1 $form): string
    {
        $form->loadMissing([
            'part.customer',
            'plan',
            'form2.materials',
            'form3Rows',
            'signatures.user:id,name,email,cert_number,signature_role_title',
        ]);

        $book = new Spreadsheet();
        $book->getProperties()
            ->setCreator('FAI Manager')
            ->setTitle('AS9102 FAI ' . ($form->fai_number ?? "form-{$form->id}"))
            ->setSubject('AS9102 First Article Inspection Report')
            ->setKeywords('AS9102 FAI aerospace');

        // Doc Section 3.8: 4-tab workbook = Cover Summary + Form 1 + Form 2 + Form 3
        $this->buildCoverSummarySheet($book->getActiveSheet(), $form);
        $this->buildForm1Sheet($book->createSheet(), $form);
        $this->buildForm2Sheet($book->createSheet(), $form);
        $this->buildForm3Sheet($book->createSheet(), $form);

        $book->setActiveSheetIndex(0);

        $writer = new Xlsx($book);
        ob_start();
        $writer->save('php://output');

        return ob_get_clean();
    }

    private function buildForm1Sheet(Worksheet $sheet, FaiForm1 $form): void
    {
        $sheet->setTitle('Form 1');

        $sheet->getColumnDimension('A')->setWidth(28);
        $sheet->getColumnDimension('B')->setWidth(30);
        $sheet->getColumnDimension('C')->setWidth(4);
        $sheet->getColumnDimension('D')->setWidth(28);
        $sheet->getColumnDimension('E')->setWidth(30);

        // Title bar
        $sheet->mergeCells('A1:E1');
        $sheet->setCellValue('A1', 'AS9102 REV C — FORM 1: PART NUMBER ACCOUNTABILITY');
        $this->styleBanner($sheet, 'A1:E1');

        // FAI number + FAIR identifier row
        $sheet->setCellValue('A2', 'FAI #');
        $sheet->setCellValue('B2', $form->fai_number);
        $sheet->setCellValue('D2', 'FAIR Identifier');
        $sheet->setCellValue('E2', $form->field4_fair_identifier);
        $this->styleLabelPair($sheet, 'A2:B2');
        $this->styleLabelPair($sheet, 'D2:E2');

        // Section: Part identification (fields 1-8)
        $this->sectionHeader($sheet, 'A4:E4', '1–8  Part Identification');
        $this->labeledPair($sheet, 5, 'A', '1. Part Number', $form->field1_part_number, 'D', '2. Part Name', $form->field2_part_name);
        $this->labeledPair($sheet, 6, 'A', '3. Serial Number', $form->field3_serial_number, 'D', '4. FAIR Identifier', $form->field4_fair_identifier);
        $this->labeledPair($sheet, 7, 'A', '5. Part Revision Level', $form->field5_part_revision, 'D', '6. Drawing Number', $form->field6_drawing_number);
        $this->labeledPair($sheet, 8, 'A', '7. Drawing Revision Level', $form->field7_drawing_revision, 'D', '8. Additional Changes', $form->field8_additional_changes);

        // Section: Program / supplier (fields 9-13)
        $this->sectionHeader($sheet, 'A10:E10', '9–13  Program & Supplier');
        $this->labeledPair($sheet, 11, 'A', '9. Mfg Process Reference', $form->field9_mfg_process_ref, 'D', '10. Organization Name', $form->field10_org_name);
        $this->labeledPair($sheet, 12, 'A', '11. Supplier Code', $form->field11_supplier_code, 'D', '12. PO Number', $form->field12_po_number);
        $this->labeledPair($sheet, 13, 'A', '13. Detail or Assembly', $form->field13_detail_or_assembly, 'D', '', '');

        // Section: FAI type (field 14)
        $this->sectionHeader($sheet, 'A15:E15', '14  FAI Type');
        $this->labeledPair($sheet, 16, 'A', '14a. Full or Partial', $form->field14_fai_type, 'D', '14b. Baseline Part Number', $form->field14_baseline_part_number);
        $sheet->setCellValue('A17', '14c. Partial Reason');
        $sheet->mergeCells('B17:E17');
        $sheet->setCellValue('B17', $form->field14_partial_reason);
        $this->styleLabel($sheet, 'A17');
        $this->styleValue($sheet, 'B17');

        // Section: nonconformance (field 19)
        $this->sectionHeader($sheet, 'A19:E19', '19  Nonconformance Flag');
        $sheet->setCellValue('A20', '19. Non-conformance present?');
        $sheet->mergeCells('B20:E20');
        $sheet->setCellValue('B20', $form->field19_has_nonconformance ? 'YES' : 'NO');
        $this->styleLabel($sheet, 'A20');
        $this->styleValue($sheet, 'B20');

        // Section: signatures (fields 20-25)
        $this->sectionHeader($sheet, 'A22:E22', '20–25  Signatures & Reviews');
        $this->labeledPair($sheet, 23, 'A', '20. Verified By', $form->field20_verified_by_name, 'D', '21. Verified At', optional($form->field21_verified_at)?->format('Y-m-d H:i'));
        $this->labeledPair($sheet, 24, 'A', '22. Reviewed By', $form->field22_reviewed_by_name, 'D', '23. Reviewed At', optional($form->field23_reviewed_at)?->format('Y-m-d H:i'));
        $this->labeledPair($sheet, 25, 'A', '24. Customer Approval', $form->field24_customer_approval_name, 'D', '25. Customer Approved At', optional($form->field25_customer_approval_at)?->format('Y-m-d H:i'));

        // Comments (field 26)
        $this->sectionHeader($sheet, 'A27:E27', '26  Comments');
        $sheet->mergeCells('A28:E30');
        $sheet->setCellValue('A28', $form->field26_comments ?? '');
        $this->styleValue($sheet, 'A28:E30');
        $sheet->getStyle('A28:E30')->getAlignment()->setWrapText(true)->setVertical(Alignment::VERTICAL_TOP);
        $sheet->getRowDimension(28)->setRowHeight(60);
    }

    private function buildForm2Sheet(Worksheet $sheet, FaiForm1 $form): void
    {
        $sheet->setTitle('Form 2');

        foreach (['A' => 4, 'B' => 24, 'C' => 22, 'D' => 18, 'E' => 22, 'F' => 22, 'G' => 22] as $col => $width) {
            $sheet->getColumnDimension($col)->setWidth($width);
        }

        // Title bar
        $sheet->mergeCells('A1:G1');
        $sheet->setCellValue('A1', 'AS9102 REV C — FORM 2: PRODUCT ACCOUNTABILITY');
        $this->styleBanner($sheet, 'A1:G1');

        // Identity block (fields 1-4 mirror Form 1 for cross-ref)
        $this->labeledPair($sheet, 3, 'B', '1. Part Number', $form->field1_part_number, 'E', '2. Part Name', $form->field2_part_name);
        $this->labeledPair($sheet, 4, 'B', '3. Serial Number', $form->field3_serial_number, 'E', '4. FAIR Identifier', $form->field4_fair_identifier);

        // Materials / processes table header (fields 5-10)
        $this->sectionHeader($sheet, 'A6:G6', '5–10  Materials, Processes, and Inspections');
        $headers = [
            'A' => '#',
            'B' => '5. Material / Process',
            'C' => '6. Spec Number',
            'D' => '7. Code',
            'E' => '8. Supplier',
            'F' => '9. Customer Approval',
            'G' => '10. CoC Number',
        ];
        foreach ($headers as $col => $label) {
            $sheet->setCellValue($col . '7', $label);
        }
        $this->styleHeader($sheet, 'A7:G7');

        // Materials rows
        $row = 8;
        $materials = $form->form2?->materials ?? collect();
        if ($materials->isEmpty()) {
            $sheet->mergeCells("A{$row}:G{$row}");
            $sheet->setCellValue("A{$row}", 'No materials or processes recorded.');
            $sheet->getStyle("A{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("A{$row}")->getFont()->setItalic(true);
            $this->applyBorder($sheet, "A{$row}:G{$row}");
        } else {
            foreach ($materials as $idx => $mat) {
                $sheet->setCellValue("A{$row}", $idx + 1);
                $sheet->setCellValue("B{$row}", $mat->field5_material_name);
                $sheet->setCellValue("C{$row}", $mat->field6_spec_number);
                $sheet->setCellValue("D{$row}", $mat->field7_code);
                $sheet->setCellValue("E{$row}", $mat->field8_supplier);
                $sheet->setCellValue("F{$row}", $mat->field9_customer_approval);
                $sheet->setCellValue("G{$row}", $mat->field10_coc_number);
                $this->applyBorder($sheet, "A{$row}:G{$row}");
                $row++;
            }
        }

        $row++;

        // Footer block (fields 11-13)
        $this->sectionHeader($sheet, "A{$row}:G{$row}", '11–13  Test Procedures & Comments');
        $row++;

        $sheet->setCellValue("A{$row}", '11. Functional Test Procedure');
        $sheet->mergeCells("B{$row}:G{$row}");
        $sheet->setCellValue("B{$row}", $form->form2?->field11_functional_test_procedure ?? '');
        $this->styleLabel($sheet, "A{$row}");
        $this->styleValue($sheet, "B{$row}");
        $row++;

        $sheet->setCellValue("A{$row}", '12. Acceptance Report Number');
        $sheet->mergeCells("B{$row}:G{$row}");
        $sheet->setCellValue("B{$row}", $form->form2?->field12_acceptance_report_number ?? '');
        $this->styleLabel($sheet, "A{$row}");
        $this->styleValue($sheet, "B{$row}");
        $row++;

        $sheet->setCellValue("A{$row}", '13. Comments');
        $sheet->mergeCells("B{$row}:G" . ($row + 2));
        $sheet->setCellValue("B{$row}", $form->form2?->field13_comments ?? '');
        $this->styleLabel($sheet, "A{$row}");
        $this->styleValue($sheet, "B{$row}:G" . ($row + 2));
        $sheet->getStyle("B{$row}:G" . ($row + 2))->getAlignment()->setWrapText(true)->setVertical(Alignment::VERTICAL_TOP);
        $sheet->getRowDimension($row)->setRowHeight(50);
    }

    private function buildForm3Sheet(Worksheet $sheet, FaiForm1 $form): void
    {
        $sheet->setTitle('Form 3');

        $widths = ['A' => 5, 'B' => 14, 'C' => 14, 'D' => 14, 'E' => 30, 'F' => 18, 'G' => 15, 'H' => 10, 'I' => 18, 'J' => 30];
        foreach ($widths as $col => $w) {
            $sheet->getColumnDimension($col)->setWidth($w);
        }

        // Title bar
        $sheet->mergeCells('A1:J1');
        $sheet->setCellValue('A1', 'AS9102 REV C — FORM 3: CHARACTERISTIC ACCOUNTABILITY, VERIFICATION AND COMPATIBILITY EVALUATION');
        $this->styleBanner($sheet, 'A1:J1');

        // Identity cross-ref
        $this->labeledPair($sheet, 3, 'B', '1. Part Number', $form->field1_part_number, 'E', '3. Serial Number', $form->field3_serial_number);
        $this->labeledPair($sheet, 4, 'B', '2. Part Name', $form->field2_part_name, 'E', '4. FAIR Identifier', $form->field4_fair_identifier);

        // Column headers
        $headers = [
            'A' => '#',
            'B' => '5. Char #',
            'C' => '6. Reference',
            'D' => '7. Designator',
            'E' => '8. Requirement',
            'F' => '9. Result',
            'G' => '10. Tooling',
            'H' => 'Pass/Fail',
            'I' => '11. NCR #',
            'J' => '14. Comments',
        ];
        foreach ($headers as $col => $label) {
            $sheet->setCellValue($col . '6', $label);
        }
        $this->styleHeader($sheet, 'A6:J6');

        // Measurement rows
        $rows = $form->form3Rows ?? collect();
        $rowIdx = 7;
        $passCount = 0;
        $failCount = 0;
        $ncrCount = 0;

        if ($rows->isEmpty()) {
            $sheet->mergeCells("A{$rowIdx}:J{$rowIdx}");
            $sheet->setCellValue("A{$rowIdx}", 'No characteristics recorded.');
            $sheet->getStyle("A{$rowIdx}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("A{$rowIdx}")->getFont()->setItalic(true);
            $this->applyBorder($sheet, "A{$rowIdx}:J{$rowIdx}");
        } else {
            foreach ($rows as $idx => $r) {
                $sheet->setCellValue("A{$rowIdx}", $idx + 1);
                $sheet->setCellValue("B{$rowIdx}", $r->field5_char_number ?? $r->balloon_number);
                $sheet->setCellValue("C{$rowIdx}", $r->field6_reference_location);
                $sheet->setCellValue("D{$rowIdx}", $r->field7_char_designator);
                $sheet->setCellValue("E{$rowIdx}", $r->field8_requirement);
                $sheet->setCellValue("F{$rowIdx}", $r->field9_results);
                $sheet->setCellValue("G{$rowIdx}", $r->field10_qualified_tooling);
                $sheet->setCellValue("H{$rowIdx}", strtoupper($r->pass_fail ?? '—'));
                $sheet->setCellValue("I{$rowIdx}", $r->field11_nonconformance_number);
                $sheet->setCellValue("J{$rowIdx}", $r->field14_additional_comments);

                $verdict = strtolower((string) $r->pass_fail);
                if ($verdict === 'pass') {
                    $passCount++;
                    $this->fillRow($sheet, "A{$rowIdx}:J{$rowIdx}", self::PASS_FILL);
                } elseif ($verdict === 'fail') {
                    $failCount++;
                    $this->fillRow($sheet, "A{$rowIdx}:J{$rowIdx}", self::FAIL_FILL);
                }

                if (! empty($r->field11_nonconformance_number)) {
                    $ncrCount++;
                }

                $this->applyBorder($sheet, "A{$rowIdx}:J{$rowIdx}");
                $sheet->getStyle("H{$rowIdx}")->applyFromArray([
                    'font' => ['bold' => true],
                    'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
                ]);
                $rowIdx++;
            }
        }

        // Summary footer
        $rowIdx++;
        $summary = sprintf(
            'Total: %d   ·   Pass: %d   ·   Fail: %d   ·   NCRs recorded: %d',
            $rows->count(),
            $passCount,
            $failCount,
            $ncrCount,
        );
        $sheet->mergeCells("A{$rowIdx}:J{$rowIdx}");
        $sheet->setCellValue("A{$rowIdx}", $summary);
        $sheet->getStyle("A{$rowIdx}")->applyFromArray([
            'font' => ['bold' => true, 'size' => 10],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => self::SECTION_FILL]],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER],
        ]);
        $sheet->getRowDimension($rowIdx)->setRowHeight(22);
        $this->applyBorder($sheet, "A{$rowIdx}:J{$rowIdx}");
    }

    /**
     * Doc Section 3.8 mandates a "Cover Summary" as Tab 1 of the AS9102 workbook.
     * Layout: identity block up top, pass/fail summary stats in the middle,
     * signature roster + embedded PNGs at the bottom so a reviewer sees the
     * whole picture on one page before drilling into Form 1/2/3.
     */
    private function buildCoverSummarySheet(Worksheet $sheet, FaiForm1 $form): void
    {
        $sheet->setTitle('Cover Summary');

        $widths = ['A' => 4, 'B' => 24, 'C' => 28, 'D' => 24, 'E' => 28, 'F' => 18, 'G' => 18];
        foreach ($widths as $col => $w) {
            $sheet->getColumnDimension($col)->setWidth($w);
        }

        // Title banner
        $sheet->mergeCells('A1:G1');
        $sheet->setCellValue('A1', 'AS9102 REV C — FIRST ARTICLE INSPECTION REPORT');
        $this->styleBanner($sheet, 'A1:G1');

        // Identity strip — FAI # + FAIR + report date all on row 2 as quick reference
        $sheet->setCellValue('B2', 'FAI Number');
        $sheet->setCellValue('C2', $form->fai_number ?? '—');
        $sheet->setCellValue('D2', 'FAIR Identifier');
        $sheet->setCellValue('E2', $form->field4_fair_identifier ?? '—');
        $sheet->setCellValue('F2', 'Report Date');
        $sheet->setCellValue('G2', now()->format('Y-m-d'));
        foreach (['B2', 'D2', 'F2'] as $c) {
            $this->styleLabel($sheet, $c);
        }
        foreach (['C2', 'E2', 'G2'] as $c) {
            $this->styleValue($sheet, $c);
        }

        // Part Identity block
        $this->sectionHeader($sheet, 'A4:G4', 'Part Identity');
        $this->labeledPair($sheet, 5, 'B', 'Part Number', $form->field1_part_number, 'E', 'Part Name', $form->field2_part_name);
        $this->labeledPair($sheet, 6, 'B', 'Serial Number', $form->field3_serial_number, 'E', 'Part Revision', $form->field5_part_revision);
        $this->labeledPair($sheet, 7, 'B', 'Drawing Number', $form->field6_drawing_number, 'E', 'Drawing Revision', $form->field7_drawing_revision);
        $this->labeledPair($sheet, 8, 'B', 'Organization', $form->field10_org_name, 'E', 'PO Number', $form->field12_po_number);

        // Inspection Summary — pass/fail stats
        $this->sectionHeader($sheet, 'A10:G10', 'Inspection Summary');
        $rows = $form->form3Rows ?? collect();
        $totalRows = $rows->count();
        $passCount = $rows->filter(fn ($r) => strtolower((string) $r->pass_fail) === 'pass')->count();
        $failCount = $rows->filter(fn ($r) => strtolower((string) $r->pass_fail) === 'fail')->count();
        $notMeasured = $rows->filter(fn ($r) => in_array(strtolower((string) $r->pass_fail), ['not_measured', 'na', ''], true))->count();
        $ncrCount = $rows->filter(fn ($r) => ! empty($r->field11_nonconformance_number))->count();

        $sheet->setCellValue('B11', 'Total Characteristics');
        $sheet->setCellValue('C11', $totalRows);
        $sheet->setCellValue('D11', 'Passed');
        $sheet->setCellValue('E11', $passCount);
        $sheet->setCellValue('F11', 'Pass Rate');
        $sheet->setCellValue('G11', $totalRows > 0 ? round(($passCount / $totalRows) * 100, 1) . '%' : '—');

        $sheet->setCellValue('B12', 'Failed');
        $sheet->setCellValue('C12', $failCount);
        $sheet->setCellValue('D12', 'Not Measured');
        $sheet->setCellValue('E12', $notMeasured);
        $sheet->setCellValue('F12', 'NCRs Recorded');
        $sheet->setCellValue('G12', $ncrCount);

        foreach (['B11', 'D11', 'F11', 'B12', 'D12', 'F12'] as $c) {
            $this->styleLabel($sheet, $c);
        }
        foreach (['C11', 'E11', 'G11', 'C12', 'E12', 'G12'] as $c) {
            $this->styleValue($sheet, $c);
            $sheet->getStyle($c)->getFont()->setBold(true);
        }
        // Color the fail cell if any
        if ($failCount > 0) {
            $sheet->getStyle('C12')->applyFromArray([
                'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => self::FAIL_FILL]],
            ]);
        }

        // Nonconformance flag callout
        $ncMsg = $form->field19_has_nonconformance ? 'YES — NCRs required for all failed characteristics' : 'NO — All characteristics conform to spec';
        $sheet->mergeCells('A14:G14');
        $sheet->setCellValue('A14', 'Nonconformance: ' . $ncMsg);
        $sheet->getStyle('A14')->applyFromArray([
            'font' => ['bold' => true, 'size' => 10, 'color' => ['argb' => $form->field19_has_nonconformance ? 'FF9B1C1C' : 'FF166534']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => $form->field19_has_nonconformance ? self::FAIL_FILL : self::PASS_FILL]],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER],
        ]);
        $sheet->getRowDimension(14)->setRowHeight(24);
        $this->applyBorder($sheet, 'A14:G14');

        // Signatures block — roster + embedded PNGs
        $signatures = $form->signatures ?? collect();
        $this->sectionHeader($sheet, 'A16:G16', 'Signatures & Authentication');

        if ($signatures->isEmpty()) {
            $sheet->mergeCells('A17:G17');
            $sheet->setCellValue('A17', 'Form is unsigned. No signatures on record.');
            $sheet->getStyle('A17')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle('A17')->getFont()->setItalic(true);
            $this->applyBorder($sheet, 'A17:G17');

            return;
        }

        // Compact roster table
        $headers = ['A' => '#', 'B' => 'Signed By', 'C' => 'Role', 'D' => 'Cert #', 'E' => 'Title', 'F' => 'Signed At', 'G' => 'IP'];
        foreach ($headers as $col => $label) {
            $sheet->setCellValue($col . '17', $label);
        }
        $this->styleHeader($sheet, 'A17:G17');

        $rowIdx = 18;
        foreach ($signatures as $idx => $sig) {
            $sheet->setCellValue("A{$rowIdx}", $idx + 1);
            $sheet->setCellValue("B{$rowIdx}", $sig->user?->name ?? '(unknown signer)');
            $sheet->setCellValue("C{$rowIdx}", ucwords(str_replace('_', ' ', $sig->signature_role ?? '')));
            $sheet->setCellValue("D{$rowIdx}", $sig->user?->cert_number ?? '—');
            $sheet->setCellValue("E{$rowIdx}", $sig->user?->signature_role_title ?? '—');
            $sheet->setCellValue("F{$rowIdx}", optional($sig->signed_at)?->format('Y-m-d H:i'));
            $sheet->setCellValue("G{$rowIdx}", $sig->ip_address ?? '—');
            $this->applyBorder($sheet, "A{$rowIdx}:G{$rowIdx}");
            $rowIdx++;
        }

        // Embedded signature + stamp PNGs per doc: "Signature image embedded
        // in Cover tab (200px wide, bottom-border line)"
        $rowIdx += 2;
        foreach ($signatures as $idx => $sig) {
            $blockStart = $rowIdx;

            $sheet->mergeCells("A{$blockStart}:G{$blockStart}");
            $sheet->setCellValue(
                "A{$blockStart}",
                '#' . ($idx + 1) . '  ' . ($sig->user?->name ?? '(unknown)') . '  ·  ' . optional($sig->signed_at)?->format('Y-m-d H:i')
            );
            $sheet->getStyle("A{$blockStart}")->applyFromArray([
                'font' => ['bold' => true, 'size' => 10],
                'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => self::SECTION_FILL]],
                'alignment' => ['horizontal' => Alignment::HORIZONTAL_LEFT, 'vertical' => Alignment::VERTICAL_CENTER, 'indent' => 1],
            ]);
            $sheet->getRowDimension($blockStart)->setRowHeight(20);
            $rowIdx++;

            $sheet->setCellValue("A{$rowIdx}", 'Signature');
            $sheet->setCellValue("E{$rowIdx}", 'QA Stamp');
            $sheet->getStyle("A{$rowIdx}")->getFont()->setBold(true);
            $sheet->getStyle("E{$rowIdx}")->getFont()->setBold(true);
            $rowIdx++;

            $imageAnchor = $rowIdx;
            for ($r = 0; $r < 8; $r++) {
                $sheet->getRowDimension($imageAnchor + $r)->setRowHeight(20);
            }

            // Signature 200px wide per doc, stamp 150px (circular, needs less width than sig)
            $this->embedImage($sheet, $sig->signature_image_path, "A{$imageAnchor}", 150, 200);
            $this->embedImage($sheet, $sig->stamp_image_path, "E{$imageAnchor}", 150, 150);

            $rowIdx = $imageAnchor + 9;
        }
    }

    private function embedImage(Worksheet $sheet, ?string $relativePath, string $anchorCell, int $heightPx, ?int $widthPx = null): void
    {
        if (empty($relativePath)) {
            return;
        }

        try {
            $absolute = Storage::disk('local')->path($relativePath);
        } catch (\Throwable) {
            return;
        }

        if (! is_string($absolute) || ! file_exists($absolute)) {
            return;
        }

        $drawing = new Drawing();
        $drawing->setName('embedded image');
        $drawing->setPath($absolute);
        if ($widthPx !== null) {
            $drawing->setResizeProportional(false);
            $drawing->setWidth($widthPx);
        }
        $drawing->setHeight($heightPx);
        $drawing->setCoordinates($anchorCell);
        $drawing->setOffsetX(4);
        $drawing->setOffsetY(4);
        $drawing->setWorksheet($sheet);
    }

    private function fillRow(Worksheet $sheet, string $range, string $argb): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => $argb]],
        ]);
    }

    // ---- Style helpers -----------------------------------------------------

    private function styleBanner(Worksheet $sheet, string $range): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'font' => ['bold' => true, 'size' => 12, 'color' => ['argb' => 'FFFFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => 'FF1F3B6E']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER],
        ]);
        $sheet->getRowDimension((int) filter_var($range, FILTER_SANITIZE_NUMBER_INT))->setRowHeight(24);
    }

    private function sectionHeader(Worksheet $sheet, string $range, string $label): void
    {
        $sheet->mergeCells($range);
        $sheet->setCellValue(strtok($range, ':'), $label);
        $sheet->getStyle($range)->applyFromArray([
            'font' => ['bold' => true, 'size' => 10],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => self::SECTION_FILL]],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_LEFT, 'vertical' => Alignment::VERTICAL_CENTER, 'indent' => 1],
        ]);
        $this->applyBorder($sheet, $range);
    }

    private function labeledPair(
        Worksheet $sheet,
        int $row,
        string $labelColL,
        string $labelL,
        ?string $valueL,
        string $labelColR,
        string $labelR,
        ?string $valueR,
    ): void {
        $valueColL = chr(ord($labelColL) + 1);
        $valueColR = chr(ord($labelColR) + 1);

        $sheet->setCellValue("{$labelColL}{$row}", $labelL);
        $sheet->setCellValue("{$valueColL}{$row}", $valueL ?? '');
        $sheet->setCellValue("{$labelColR}{$row}", $labelR);
        $sheet->setCellValue("{$valueColR}{$row}", $valueR ?? '');

        $this->styleLabel($sheet, "{$labelColL}{$row}");
        $this->styleValue($sheet, "{$valueColL}{$row}");
        $this->styleLabel($sheet, "{$labelColR}{$row}");
        $this->styleValue($sheet, "{$valueColR}{$row}");
    }

    private function styleLabelPair(Worksheet $sheet, string $range): void
    {
        [$labelCell, $valueCell] = explode(':', $range);
        $this->styleLabel($sheet, $labelCell);
        $this->styleValue($sheet, $valueCell);
    }

    private function styleLabel(Worksheet $sheet, string $range): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'font' => ['bold' => true, 'size' => 9],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => self::HEADER_FILL]],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_LEFT, 'vertical' => Alignment::VERTICAL_CENTER, 'indent' => 1],
        ]);
        $this->applyBorder($sheet, $range);
    }

    private function styleValue(Worksheet $sheet, string $range): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'font' => ['size' => 10],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_LEFT, 'vertical' => Alignment::VERTICAL_CENTER, 'indent' => 1],
        ]);
        $this->applyBorder($sheet, $range);
    }

    private function styleHeader(Worksheet $sheet, string $range): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'font' => ['bold' => true, 'size' => 10, 'color' => ['argb' => 'FFFFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => 'FF3F6BB0']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER, 'wrapText' => true],
        ]);
        $sheet->getRowDimension((int) filter_var($range, FILTER_SANITIZE_NUMBER_INT))->setRowHeight(28);
        $this->applyBorder($sheet, $range);
    }

    private function applyBorder(Worksheet $sheet, string $range): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'borders' => ['allBorders' => ['borderStyle' => Border::BORDER_THIN, 'color' => ['argb' => 'FF888888']]],
        ]);
    }
}
