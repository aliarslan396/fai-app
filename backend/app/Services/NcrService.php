<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\CustomReportCharacteristic;
use App\Models\FaiForm3Row;
use App\Models\Ncr;
use App\Models\TenantUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

/**
 * Single entry point for NCR mutations. Controllers never touch Ncr::create()
 * or ->update() directly — everything goes through here so:
 *   1. Auto-numbering NCR-YYYY-NNNN stays sequential and race-safe (DB lock)
 *   2. Audit log always fires
 *   3. Status transitions follow the state machine (open → dispositioned → closed)
 *
 * The service is stateless — safe to inject via container.
 */
class NcrService
{
    /**
     * Create an NCR from scratch (walk-in defect, no form row yet).
     */
    public function create(TenantUser $creator, array $attributes): Ncr
    {
        $this->validateSeverity($attributes['severity'] ?? Ncr::SEVERITY_MAJOR);
        if (! empty($attributes['detection_point'])) {
            $this->validateDetectionPoint($attributes['detection_point']);
        }

        return DB::transaction(function () use ($creator, $attributes) {
            $ncr = Ncr::create([
                'ncr_number' => $this->nextNcrNumber(),
                'part_id' => $attributes['part_id'] ?? null,
                'inspection_session_id' => $attributes['inspection_session_id'] ?? null,
                'lot_serial' => $attributes['lot_serial'] ?? null,
                'quantity_affected' => $attributes['quantity_affected'] ?? null,
                'defect_code' => $attributes['defect_code'] ?? null,
                'source_type' => $attributes['source_type'] ?? null,
                'source_id' => $attributes['source_id'] ?? null,
                'characteristic_ref' => $attributes['characteristic_ref'] ?? null,
                'requirement' => $attributes['requirement'] ?? null,
                'actual_result' => $attributes['actual_result'] ?? null,
                'unit' => $attributes['unit'] ?? null,
                'severity' => $attributes['severity'] ?? Ncr::SEVERITY_MAJOR,
                'cause' => $attributes['cause'] ?? null,
                'disposition' => Ncr::DISPOSITION_PENDING,
                'status' => Ncr::STATUS_OPEN,
                'material_cost' => $attributes['material_cost'] ?? null,
                'labor_hours' => $attributes['labor_hours'] ?? null,
                'scrap_value' => $attributes['scrap_value'] ?? null,
                'created_by' => $creator->id,
                'detected_by' => $attributes['detected_by'] ?? $creator->id,
                'detection_point' => $attributes['detection_point'] ?? null,
            ]);

            AuditLog::record('ncr.created', [
                'subject_type' => Ncr::class,
                'subject_id' => $ncr->id,
                'meta' => [
                    'ncr_number' => $ncr->ncr_number,
                    'part_id' => $ncr->part_id,
                    'severity' => $ncr->severity,
                    'defect_code' => $ncr->defect_code,
                    'detection_point' => $ncr->detection_point,
                    'user_id' => $creator->id,
                ],
            ]);

            return $ncr;
        });
    }

    /**
     * Update the editable fields on an open NCR. Blocked once dispositioned
     * so history stays immutable (disposition-time snapshot). Any change
     * is audit-logged with a diff.
     */
    public function update(TenantUser $user, Ncr $ncr, array $attributes): Ncr
    {
        if (! $ncr->isOpen()) {
            throw new RuntimeException("NCR {$ncr->ncr_number} is not open — cannot edit after disposition");
        }
        if (! empty($attributes['detection_point'])) {
            $this->validateDetectionPoint($attributes['detection_point']);
        }
        if (! empty($attributes['severity'])) {
            $this->validateSeverity($attributes['severity']);
        }

        $editable = [
            'lot_serial', 'quantity_affected', 'defect_code',
            'characteristic_ref', 'requirement', 'actual_result', 'unit',
            'severity', 'cause',
            'material_cost', 'labor_hours', 'scrap_value',
            'detected_by', 'detection_point',
        ];

        return DB::transaction(function () use ($user, $ncr, $attributes, $editable) {
            $before = $ncr->only($editable);
            $updates = array_intersect_key($attributes, array_flip($editable));
            $ncr->update($updates);

            AuditLog::record('ncr.updated', [
                'subject_type' => Ncr::class,
                'subject_id' => $ncr->id,
                'meta' => [
                    'ncr_number' => $ncr->ncr_number,
                    'before' => $before,
                    'after' => $ncr->only($editable),
                    'user_id' => $user->id,
                ],
            ]);

            return $ncr->fresh();
        });
    }

    /**
     * Create an NCR from a failed Form 3 or Custom Report row. Copies the
     * failure snapshot into the NCR so later form re-sync doesn't blank it.
     */
    public function createFromRow(TenantUser $creator, Model $row, array $overrides = []): Ncr
    {
        if (! $row instanceof FaiForm3Row && ! $row instanceof CustomReportCharacteristic) {
            throw new InvalidArgumentException('Row must be FaiForm3Row or CustomReportCharacteristic');
        }

        $snapshot = $this->snapshotFromRow($row);

        return $this->create($creator, array_merge($snapshot, $overrides));
    }

    /**
     * Record the QA Manager's disposition. Transitions open → dispositioned.
     */
    public function disposition(TenantUser $manager, Ncr $ncr, string $disposition, ?string $notes = null): Ncr
    {
        $this->validateDisposition($disposition);

        if (! $ncr->isOpen()) {
            throw new RuntimeException("NCR {$ncr->ncr_number} is not open — current status: {$ncr->status}");
        }

        if ($disposition === Ncr::DISPOSITION_PENDING) {
            throw new InvalidArgumentException('Cannot disposition to `pending` — that is the initial state');
        }

        return DB::transaction(function () use ($manager, $ncr, $disposition, $notes) {
            $ncr->update([
                'disposition' => $disposition,
                'disposition_notes' => $notes,
                'dispositioned_by' => $manager->id,
                'dispositioned_at' => now(),
                'status' => Ncr::STATUS_DISPOSITIONED,
            ]);

            AuditLog::record('ncr.dispositioned', [
                'subject_type' => Ncr::class,
                'subject_id' => $ncr->id,
                'meta' => [
                    'ncr_number' => $ncr->ncr_number,
                    'disposition' => $disposition,
                    'user_id' => $manager->id,
                ],
            ]);

            return $ncr->fresh();
        });
    }

    /**
     * Close an NCR after corrective action verified. Transitions
     * dispositioned → closed.
     */
    public function close(TenantUser $user, Ncr $ncr, ?string $closureNotes = null): Ncr
    {
        if (! $ncr->isDispositioned()) {
            throw new RuntimeException("NCR {$ncr->ncr_number} cannot be closed from status: {$ncr->status}");
        }

        return DB::transaction(function () use ($user, $ncr, $closureNotes) {
            $ncr->update([
                'closure_notes' => $closureNotes,
                'closed_by' => $user->id,
                'closed_at' => now(),
                'status' => Ncr::STATUS_CLOSED,
            ]);

            AuditLog::record('ncr.closed', [
                'subject_type' => Ncr::class,
                'subject_id' => $ncr->id,
                'meta' => [
                    'ncr_number' => $ncr->ncr_number,
                    'user_id' => $user->id,
                ],
            ]);

            return $ncr->fresh();
        });
    }

    /**
     * Reserve the next NCR-YYYY-NNNN sequential number. Uses a row-level
     * lock on the max existing number for the current year to prevent race
     * conditions under concurrent creates.
     */
    private function nextNcrNumber(): string
    {
        $year = now()->year;
        $prefix = "NCR-{$year}-";

        return DB::transaction(function () use ($year, $prefix) {
            // lockForUpdate ensures no other transaction sees the same max
            // until we've committed the new row.
            $lastNumber = Ncr::withTrashed()
                ->where('ncr_number', 'like', $prefix . '%')
                ->lockForUpdate()
                ->orderByDesc('ncr_number')
                ->value('ncr_number');

            $lastSeq = 0;
            if ($lastNumber) {
                $lastSeq = (int) substr($lastNumber, strlen($prefix));
            }

            return sprintf('NCR-%04d-%04d', $year, $lastSeq + 1);
        });
    }

    private function validateSeverity(string $severity): void
    {
        if (! in_array($severity, Ncr::SEVERITIES, true)) {
            throw new InvalidArgumentException("Invalid severity: {$severity}");
        }
    }

    private function validateDisposition(string $disposition): void
    {
        if (! in_array($disposition, Ncr::DISPOSITIONS, true)) {
            throw new InvalidArgumentException("Invalid disposition: {$disposition}");
        }
    }

    private function validateDetectionPoint(string $point): void
    {
        if (! in_array($point, Ncr::DETECTION_POINTS, true)) {
            throw new InvalidArgumentException("Invalid detection_point: {$point}");
        }
    }

    /**
     * Copy the relevant failure data from either FaiForm3Row or
     * CustomReportCharacteristic into a normalized attribute array.
     */
    private function snapshotFromRow(Model $row): array
    {
        if ($row instanceof FaiForm3Row) {
            $form = $row->form1()->with('session')->first();

            return [
                'source_type' => get_class($row),
                'source_id' => $row->id,
                'part_id' => $form?->part_id,
                'inspection_session_id' => $form?->inspection_session_id,
                'characteristic_ref' => $row->field5_char_number ?? (string) $row->balloon_number,
                'requirement' => $row->field8_requirement,
                'actual_result' => $row->field9_results,
            ];
        }

        // CustomReportCharacteristic
        $report = $row->report()->with('part')->first();

        return [
            'source_type' => get_class($row),
            'source_id' => $row->id,
            'part_id' => $report?->part_id,
            'inspection_session_id' => $report?->inspection_session_id,
            'characteristic_ref' => $row->field5_char_number ?? (string) $row->balloon_number,
            'requirement' => $row->field8_requirement,
            'actual_result' => $row->field9_results,
        ];
    }
}
