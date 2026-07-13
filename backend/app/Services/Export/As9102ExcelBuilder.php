<?php

namespace App\Services\Export;

use App\Models\FaiForm1;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Renders an AS9102 Rev C compliant 4-tab workbook for a signed FAI.
 *
 * Tab layout (per AS9102 spec):
 *   1. Form 1 — Part Number Accountability (26 numbered fields)
 *   2. Form 2 — Product Accountability (materials + processes)
 *   3. Form 3 — Characteristic Accountability (measurements — Day 3)
 *   4. Signatures — signer roster + embedded stamp / sig PNGs (Day 3)
 *
 * Only tabs 1 + 2 are populated today (Week 14 Day 2). Tabs 3 + 4
 * added Day 3.
 */
class As9102ExcelBuilder
{
    private const HEADER_FILL = 'FFE8EEF7';
    private const SECTION_FILL = 'FFD5DEEA';

    public function build(FaiForm1 $form): string
    {
        $form->loadMissing([
            'part.customer',
            'plan',
            'form2.materials',
        ]);

        $book = new Spreadsheet();
        $book->getProperties()
            ->setCreator('FAI Manager')
            ->setTitle('AS9102 FAI ' . ($form->fai_number ?? "form-{$form->id}"))
            ->setSubject('AS9102 First Article Inspection Report')
            ->setKeywords('AS9102 FAI aerospace');

        $this->buildForm1Sheet($book->getActiveSheet(), $form);
        $this->buildForm2Sheet($book->createSheet(), $form);

        $book->setActiveSheetIndex(0);

        $writer = new Xlsx($book);
        ob_start();
        $writer->save('php://output');

        return ob_get_clean();
    }

    private function buildForm1Sheet(Worksheet $sheet, FaiForm1 $form): void
    {
        $sheet->setTitle('Form 1');

        $sheet->getColumnDimension('A')->setWidth(4);
        $sheet->getColumnDimension('B')->setWidth(28);
        $sheet->getColumnDimension('C')->setWidth(32);
        $sheet->getColumnDimension('D')->setWidth(28);
        $sheet->getColumnDimension('E')->setWidth(32);

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
        $this->labeledPair($sheet, 3, 'A', '1. Part Number', $form->field1_part_number, 'D', '2. Part Name', $form->field2_part_name);
        $this->labeledPair($sheet, 4, 'A', '3. Serial Number', $form->field3_serial_number, 'D', '4. FAIR Identifier', $form->field4_fair_identifier);

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
