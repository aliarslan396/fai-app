<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Capa;
use App\Models\Ncr;
use App\Models\TenantUser;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Single entry point for CAPA mutations. Same rationale as NcrService:
 *   - Auto-numbering CAPA-YYYY-NNNN stays sequential + race-safe (lock)
 *   - Audit log always fires
 *   - State machine transitions gated here (Sprint 2)
 *
 * Stub scope: only createFromNcr(). Full workflow methods land with
 * the 5-tab UI in Sprint 2.
 */
class CapaService
{
    /**
     * Escalate an NCR to a CAPA. Copies part, defect_code, and a
     * summary problem_statement so the CAPA form is pre-populated
     * — inspector doesn't re-type data that already exists on the
     * NCR. Also writes the reverse link on ncrs.capa_id so both
     * records reference each other permanently.
     */
    public function createFromNcr(TenantUser $creator, Ncr $ncr): Capa
    {
        if ($ncr->capa_id) {
            throw new RuntimeException("NCR {$ncr->ncr_number} is already linked to a CAPA (#{$ncr->capa_id}). One NCR ↔ one CAPA.");
        }

        return DB::transaction(function () use ($creator, $ncr) {
            $problemStatement = $this->buildProblemStatement($ncr);

            $capa = Capa::create([
                'capa_number' => $this->nextCapaNumber(),
                'source_ncr_id' => $ncr->id,
                'part_id' => $ncr->part_id,
                'defect_code' => $ncr->defect_code,
                'problem_statement' => $problemStatement,
                'status' => Capa::STATUS_OPEN,
                'created_by' => $creator->id,
            ]);

            // Reverse-link the NCR back to the CAPA so bidirectional
            // traceability holds for auditors.
            $ncr->update(['capa_id' => $capa->id]);

            AuditLog::record('capa.created', [
                'subject_type' => Capa::class,
                'subject_id' => $capa->id,
                'meta' => [
                    'capa_number' => $capa->capa_number,
                    'source_ncr_id' => $ncr->id,
                    'source_ncr_number' => $ncr->ncr_number,
                    'part_id' => $ncr->part_id,
                    'defect_code' => $ncr->defect_code,
                    'user_id' => $creator->id,
                ],
            ]);

            return $capa->fresh(['sourceNcr:id,ncr_number', 'part:id,part_number,description', 'creator:id,name']);
        });
    }

    /**
     * Cheap human-readable problem_statement seed. Inspector will
     * refine this in the CAPA UI (Sprint 2). Keeps enough context that
     * the CAPA is meaningful even if never edited.
     */
    private function buildProblemStatement(Ncr $ncr): string
    {
        $parts = ["Escalated from NCR {$ncr->ncr_number}"];
        if ($ncr->defect_code) {
            $parts[] = "defect: {$ncr->defect_code}";
        }
        if ($ncr->part_id) {
            $partNumber = $ncr->part?->part_number;
            if ($partNumber) {
                $parts[] = "part: {$partNumber}";
            }
        }
        if ($ncr->quantity_affected) {
            $parts[] = "qty affected: {$ncr->quantity_affected}";
        }
        if ($ncr->detection_point) {
            $parts[] = "detected at: {$ncr->detection_point}";
        }
        return implode(' · ', $parts);
    }

    /**
     * CAPA-YYYY-NNNN sequential number. Same lock pattern as
     * NcrService so concurrent creates don't collide.
     */
    private function nextCapaNumber(): string
    {
        $year = now()->year;
        $prefix = "CAPA-{$year}-";

        return DB::transaction(function () use ($year, $prefix) {
            $lastNumber = Capa::withTrashed()
                ->where('capa_number', 'like', $prefix . '%')
                ->lockForUpdate()
                ->orderByDesc('capa_number')
                ->value('capa_number');

            $lastSeq = 0;
            if ($lastNumber) {
                $lastSeq = (int) substr($lastNumber, strlen($prefix));
            }

            return sprintf('CAPA-%04d-%04d', $year, $lastSeq + 1);
        });
    }
}
