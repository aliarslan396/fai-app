<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Atomic auto-numbering per doc spec:
 *   IP-YYYY-NNNN  inspection plans
 *   FAI-YYYY-NNNN AS9102 reports
 *   IR-YYYY-NNNN  custom inspection reports
 *   NCR-YYYY-NNNN non-conformance reports
 *   CAPA-YYYY-NNNN corrective actions
 *
 * Uses report_sequences table with row-level locking. Tenant-scoped.
 */
class ReportNumberService
{
    public function next(string $prefix, ?int $year = null): string
    {
        $year ??= (int) date('Y');
        $prefix = strtoupper($prefix);

        return DB::transaction(function () use ($prefix, $year) {
            // PostgreSQL upsert + RETURNING avoids race condition under load
            $row = DB::selectOne(
                'INSERT INTO report_sequences (prefix, year, seq) VALUES (?, ?, 1)
                 ON CONFLICT (prefix, year) DO UPDATE SET seq = report_sequences.seq + 1
                 RETURNING seq',
                [$prefix, $year]
            );

            return sprintf('%s-%d-%04d', $prefix, $year, $row->seq);
        });
    }
}
