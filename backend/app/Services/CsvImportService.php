<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\InspectionPlan;
use App\Models\Part;
use App\Models\TenantUser;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * CSV bulk import — Parts + Inspection Plans (doc 3.1 / 3.5).
 *
 * Two-phase flow:
 *   preview(file) → row-by-row analysis (no writes) + counts + errors
 *   commit(file, user) → same parse, then INSERT everything in one txn.
 *
 * The client passes the file to both endpoints so the server never
 * has to hold parsed state between requests. CSVs are small (~1MB)
 * so re-parsing on commit is cheap.
 *
 * Robustness:
 *   - Strips UTF-8 BOM, detects Windows-1252, normalizes headers
 *     (lowercase, snake_case)
 *   - Duplicate detection scoped inside the file AND vs existing DB
 *   - One bad row does not corrupt the batch — the whole commit
 *     runs in a DB transaction and rolls back on any DB-level error
 */
class CsvImportService
{
    /** Rows returned per preview so the UI can render a sample. */
    private const PREVIEW_SAMPLE_SIZE = 25;

    /** Hard cap so someone can't upload a 5M-row CSV and starve memory. */
    private const MAX_ROWS = 5000;

    // ------------------------------------------------------------------ Parts

    public function previewParts(UploadedFile $file): array
    {
        return $this->analyzeParts($this->readCsv($file));
    }

    public function commitParts(UploadedFile $file, TenantUser $user): array
    {
        $rows = $this->readCsv($file);
        $analysis = $this->analyzeParts($rows);

        if ($analysis['error_count'] > 0) {
            return [
                'committed' => 0,
                'error_count' => $analysis['error_count'],
                'errors' => $analysis['errors'],
                'message' => 'Fix the errors and re-upload — nothing was written.',
            ];
        }

        $inserted = 0;
        $customerCache = [];

        DB::transaction(function () use ($analysis, $user, &$inserted, &$customerCache) {
            foreach ($analysis['new_rows'] as $row) {
                $customerId = null;
                if (! empty($row['customer'])) {
                    $key = strtolower(trim($row['customer']));
                    if (! isset($customerCache[$key])) {
                        $c = Customer::firstOrCreate(
                            ['name' => $row['customer']],
                            ['code' => strtoupper(substr(preg_replace('/\s+/', '', $row['customer']), 0, 12)), 'active' => true],
                        );
                        $customerCache[$key] = $c->id;
                    }
                    $customerId = $customerCache[$key];
                }

                Part::create([
                    'part_number' => $row['part_number'],
                    'revision' => $row['revision'] ?: 'A',
                    'description' => $row['description'],
                    'customer_id' => $customerId,
                    'part_type' => $row['part_type'] ?: 'finish',
                    'material' => $row['material'] ?: null,
                    'material_spec' => $row['material_spec'] ?: null,
                    'process' => $row['process'] ?: null,
                    'weight' => is_numeric($row['weight'] ?? null) ? (float) $row['weight'] : null,
                    // weight_unit + uom are NOT NULL with defaults in the
                    // schema — pass the default when blank rather than null.
                    'weight_unit' => $row['weight_unit'] ?: 'g',
                    'uom' => $row['uom'] ?: 'ea',
                    'classification' => $row['classification'] ?: null,
                    'status' => $row['status'] ?: 'active',
                    'notes' => $row['notes'] ?: null,
                    'created_by' => $user->id,
                ]);
                $inserted++;
            }
        });

        AuditLog::record('parts.csv_imported', [
            'meta' => [
                'user_id' => $user->id,
                'inserted' => $inserted,
                'skipped_duplicates' => $analysis['skipped_count'],
                'total_rows' => $analysis['total_rows'],
            ],
        ]);

        return [
            'committed' => $inserted,
            'skipped_duplicates' => $analysis['skipped_count'],
            'error_count' => 0,
            'total_rows' => $analysis['total_rows'],
        ];
    }

    private function analyzeParts(array $rows): array
    {
        $partSchema = [
            'required' => ['part_number', 'description'],
            'optional' => [
                'revision', 'customer', 'part_type', 'material', 'material_spec',
                'process', 'weight', 'weight_unit', 'uom', 'classification',
                'status', 'notes',
            ],
        ];

        $newRows = [];
        $skipped = [];
        $errors = [];
        $seenInFile = [];

        // Preload existing (part_number, revision) pairs for O(1) dup lookup.
        $existing = Part::query()
            ->select('part_number', 'revision')
            ->get()
            ->map(fn ($p) => strtolower($p->part_number) . '||' . strtolower($p->revision))
            ->flip();

        $lineNum = 1; // header line
        foreach ($rows as $row) {
            $lineNum++;
            $errs = $this->validateRow($row, $partSchema['required']);

            $partNumber = trim($row['part_number'] ?? '');
            $revision = trim($row['revision'] ?? 'A') ?: 'A';
            $description = trim($row['description'] ?? '');

            $key = strtolower($partNumber) . '||' . strtolower($revision);

            if (isset($seenInFile[$key])) {
                $errs[] = "duplicate of row {$seenInFile[$key]} within this file";
            } else {
                $seenInFile[$key] = $lineNum;
            }

            if ($errs) {
                $errors[] = ['line' => $lineNum, 'part' => $partNumber, 'errors' => $errs];
                continue;
            }

            if ($existing->has($key)) {
                $skipped[] = ['line' => $lineNum, 'part' => "{$partNumber} rev {$revision}"];
                continue;
            }

            $status = strtolower(trim($row['status'] ?? 'active'));
            if ($status && ! in_array($status, ['active', 'obsolete', 'hold', 'draft'], true)) {
                $errors[] = ['line' => $lineNum, 'part' => $partNumber, 'errors' => ["status '{$status}' must be one of: active, obsolete, hold, draft"]];
                continue;
            }

            $newRows[] = [
                'line' => $lineNum,
                'part_number' => $partNumber,
                'revision' => $revision,
                'description' => $description,
                'customer' => trim($row['customer'] ?? ''),
                'part_type' => strtolower(trim($row['part_type'] ?? '')),
                'material' => trim($row['material'] ?? ''),
                'material_spec' => trim($row['material_spec'] ?? ''),
                'process' => trim($row['process'] ?? ''),
                'weight' => trim($row['weight'] ?? ''),
                'weight_unit' => trim($row['weight_unit'] ?? ''),
                'uom' => trim($row['uom'] ?? ''),
                'classification' => trim($row['classification'] ?? ''),
                'status' => $status,
                'notes' => trim($row['notes'] ?? ''),
            ];
        }

        return [
            'total_rows' => count($rows),
            'new_count' => count($newRows),
            'skipped_count' => count($skipped),
            'error_count' => count($errors),
            'sample_new' => array_slice($newRows, 0, self::PREVIEW_SAMPLE_SIZE),
            'skipped' => array_slice($skipped, 0, self::PREVIEW_SAMPLE_SIZE),
            'errors' => array_slice($errors, 0, 100),
            'new_rows' => $newRows,
        ];
    }

    // ------------------------------------------------------------------ Plans

    public function previewPlans(UploadedFile $file): array
    {
        return $this->analyzePlans($this->readCsv($file));
    }

    public function commitPlans(UploadedFile $file, TenantUser $user): array
    {
        $rows = $this->readCsv($file);
        $analysis = $this->analyzePlans($rows);

        if ($analysis['error_count'] > 0) {
            return [
                'committed' => 0,
                'error_count' => $analysis['error_count'],
                'errors' => $analysis['errors'],
                'message' => 'Fix the errors and re-upload — nothing was written.',
            ];
        }

        $inserted = 0;
        $numbers = app(ReportNumberService::class);

        DB::transaction(function () use ($analysis, $user, $numbers, &$inserted) {
            foreach ($analysis['new_rows'] as $row) {
                InspectionPlan::create([
                    'plan_number' => $row['plan_number'] ?: $numbers->next('IP'),
                    'part_id' => $row['part_id'],
                    'plan_name' => $row['plan_name'],
                    'status' => $row['status'] ?: 'draft',
                    'created_by' => $user->id,
                ]);
                $inserted++;
            }
        });

        AuditLog::record('plans.csv_imported', [
            'meta' => ['user_id' => $user->id, 'inserted' => $inserted, 'total_rows' => $analysis['total_rows']],
        ]);

        return [
            'committed' => $inserted,
            'error_count' => 0,
            'total_rows' => $analysis['total_rows'],
        ];
    }

    private function analyzePlans(array $rows): array
    {
        $required = ['part_number', 'revision', 'plan_name'];
        $newRows = [];
        $errors = [];

        // Preload part lookup: "part_number||revision" (lower) → part_id
        $partsMap = Part::query()
            ->select('id', 'part_number', 'revision')
            ->get()
            ->mapWithKeys(fn ($p) => [strtolower($p->part_number) . '||' . strtolower($p->revision) => $p->id])
            ->toArray();

        $lineNum = 1;
        foreach ($rows as $row) {
            $lineNum++;
            $errs = $this->validateRow($row, $required);

            $pn = trim($row['part_number'] ?? '');
            $rev = trim($row['revision'] ?? '');
            $key = strtolower($pn) . '||' . strtolower($rev);

            $partId = $partsMap[$key] ?? null;
            if (! $partId && $pn && $rev) {
                $errs[] = "part '{$pn} rev {$rev}' not found — create the part first";
            }

            $status = strtolower(trim($row['status'] ?? 'draft'));
            if ($status && ! in_array($status, ['draft', 'active', 'superseded'], true)) {
                $errs[] = "status '{$status}' must be one of: draft, active, superseded";
            }

            if ($errs) {
                $errors[] = ['line' => $lineNum, 'plan' => trim($row['plan_name'] ?? ''), 'errors' => $errs];
                continue;
            }

            $newRows[] = [
                'line' => $lineNum,
                'part_id' => $partId,
                'part_number' => $pn,
                'revision' => $rev,
                'plan_name' => trim($row['plan_name']),
                'plan_number' => trim($row['plan_number'] ?? ''),
                'status' => $status,
            ];
        }

        return [
            'total_rows' => count($rows),
            'new_count' => count($newRows),
            'skipped_count' => 0,
            'error_count' => count($errors),
            'sample_new' => array_slice($newRows, 0, self::PREVIEW_SAMPLE_SIZE),
            'skipped' => [],
            'errors' => array_slice($errors, 0, 100),
            'new_rows' => $newRows,
        ];
    }

    // -------------------------------------------------------- CSV / helpers

    /**
     * Parse CSV to an array of associative rows keyed by normalized
     * headers. Handles UTF-8 BOM, quoted commas, blank rows, and
     * Windows-1252 characters (Excel default on many machines).
     */
    private function readCsv(UploadedFile $file): array
    {
        $content = file_get_contents($file->getRealPath());
        if ($content === false) {
            throw new \RuntimeException('Could not read uploaded file.');
        }

        // BOM strip
        if (str_starts_with($content, "\xEF\xBB\xBF")) {
            $content = substr($content, 3);
        }
        // Convert to UTF-8 if not already
        if (! mb_check_encoding($content, 'UTF-8')) {
            $content = mb_convert_encoding($content, 'UTF-8', 'Windows-1252');
        }

        $lines = preg_split("/(\r\n|\n|\r)/", $content);
        $lines = array_filter(array_map('trim', $lines), fn ($l) => $l !== '');
        if (count($lines) < 2) {
            throw new \RuntimeException('CSV must have a header row and at least one data row.');
        }

        $headers = str_getcsv(array_shift($lines));
        $headers = array_map(fn ($h) => $this->normalizeHeader($h), $headers);

        $rows = [];
        foreach ($lines as $line) {
            if (count($rows) >= self::MAX_ROWS) {
                throw new \RuntimeException('CSV exceeds the ' . self::MAX_ROWS . '-row cap. Split the file into smaller batches.');
            }
            $fields = str_getcsv($line);
            // Right-pad short rows so array_combine doesn't fail
            while (count($fields) < count($headers)) {
                $fields[] = '';
            }
            $fields = array_slice($fields, 0, count($headers));
            $rows[] = array_combine($headers, $fields);
        }
        return $rows;
    }

    private function normalizeHeader(string $h): string
    {
        $h = trim($h);
        $h = strtolower($h);
        $h = preg_replace('/[^a-z0-9]+/', '_', $h);
        return trim($h, '_');
    }

    private function validateRow(array $row, array $required): array
    {
        $errs = [];
        foreach ($required as $field) {
            if (! isset($row[$field]) || trim((string) $row[$field]) === '') {
                $errs[] = "missing required field '{$field}'";
            }
        }
        return $errs;
    }

    // ------------------------------------------------------------- Templates

    public function partsTemplate(): string
    {
        return "part_number,revision,description,customer,part_type,material,material_spec,process,weight,weight_unit,uom,classification,status,notes\n"
            . "GPE-101,12,Bushing Assembly,Boeing,finish,Al 6061-T6,AMS 4027,machined,2.5,lbs,EA,commercial,active,Example row — delete before real import\n";
    }

    public function plansTemplate(): string
    {
        return "part_number,revision,plan_name,plan_number,status\n"
            . "GPE-101,12,Initial FAI Plan,,draft\n";
    }
}
