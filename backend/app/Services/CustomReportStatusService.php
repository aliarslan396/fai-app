<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\CustomInspectionReport;
use App\Models\CustomReportCharacteristic;
use App\Models\TenantUser;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Draft → Complete → Signed lifecycle for the DEF-QA-003 Custom
 * Inspection Report (doc 3.5). Mirrors FaiStatusService intent but
 * uses the simpler 3-state model per the doc.
 *
 * Transitions:
 *   draft ──markComplete──▶ complete
 *   complete ──sign──▶ signed          (via SignatureService — locks)
 *   complete ──reopenToDraft──▶ draft  (inspector unlocks their own work)
 *   signed ──reopen(admin)──▶ draft    (formal request, cascades unlock)
 *
 * Signing is the ONLY path to `signed`. Sign flow lives in
 * SignatureService — this service exposes `markSignedFromSign` for it
 * to call once the signature row + lock columns are written.
 */
class CustomReportStatusService
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_COMPLETE = 'complete';
    public const STATUS_SIGNED = 'signed';

    public const STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_COMPLETE,
        self::STATUS_SIGNED,
    ];

    /**
     * Inspector marks report ready for signature.
     * Allowed from: draft only. Guards that at least one row has a result
     * so we don't ship an empty form to the signer.
     */
    public function markComplete(TenantUser $user, CustomInspectionReport $report): CustomInspectionReport
    {
        if ($report->status !== self::STATUS_DRAFT) {
            throw new RuntimeException("Cannot mark complete — report status is {$report->status}, must be draft.");
        }
        if ($report->locked) {
            throw new RuntimeException('Report is locked.');
        }

        $filledCount = CustomReportCharacteristic::where('custom_report_id', $report->id)
            ->whereNotNull('field9_results')
            ->where('field9_results', '!=', '')
            ->count();
        if ($filledCount === 0) {
            throw new RuntimeException('At least one row must have a result before marking complete.');
        }

        return DB::transaction(function () use ($user, $report) {
            $report->update(['status' => self::STATUS_COMPLETE]);

            AuditLog::record('custom_report.marked_complete', [
                'subject_type' => CustomInspectionReport::class,
                'subject_id' => $report->id,
                'meta' => [
                    'ir_number' => $report->ir_number,
                    'user_id' => $user->id,
                    'from' => self::STATUS_DRAFT,
                ],
            ]);

            return $report->fresh();
        });
    }

    /**
     * Called by SignatureService after a valid signature is written on
     * a CustomInspectionReport. Idempotent — safe to call even if the
     * status is already signed (does nothing).
     */
    public function markSignedFromSign(CustomInspectionReport $report): void
    {
        if ($report->status === self::STATUS_SIGNED) {
            return;
        }

        $report->update(['status' => self::STATUS_SIGNED]);

        AuditLog::record('custom_report.signed', [
            'subject_type' => CustomInspectionReport::class,
            'subject_id' => $report->id,
            'meta' => [
                'ir_number' => $report->ir_number,
                'from' => $report->getOriginal('status'),
            ],
        ]);
    }

    /**
     * Inspector can walk their own Complete back to Draft without any
     * admin action — no signature has landed yet.
     */
    public function reopenToDraft(TenantUser $user, CustomInspectionReport $report): CustomInspectionReport
    {
        if ($report->status !== self::STATUS_COMPLETE) {
            throw new RuntimeException("Cannot reopen — report status is {$report->status}, must be complete.");
        }
        if ($report->locked) {
            throw new RuntimeException('Report is locked — needs an admin to reopen a signed report.');
        }

        return DB::transaction(function () use ($user, $report) {
            $report->update(['status' => self::STATUS_DRAFT]);

            AuditLog::record('custom_report.reopened_to_draft', [
                'subject_type' => CustomInspectionReport::class,
                'subject_id' => $report->id,
                'meta' => [
                    'ir_number' => $report->ir_number,
                    'user_id' => $user->id,
                ],
            ]);

            return $report->fresh();
        });
    }

    /**
     * Admin-only unlock of a signed report. Clears the lock columns +
     * flips status back to draft so the inspector can fix + re-sign.
     * Signature rows STAY in the audit log — this doesn't rewrite
     * history, it just permits new edits.
     */
    public function reopenSigned(TenantUser $admin, CustomInspectionReport $report, string $reason): CustomInspectionReport
    {
        if ($report->status !== self::STATUS_SIGNED) {
            throw new RuntimeException("Cannot reopen — report status is {$report->status}, must be signed.");
        }
        if (trim($reason) === '') {
            throw new RuntimeException('A reason is required to reopen a signed report.');
        }

        return DB::transaction(function () use ($admin, $report, $reason) {
            $report->update([
                'status' => self::STATUS_DRAFT,
                'locked' => false,
                'locked_at' => null,
                'locked_by' => null,
            ]);

            AuditLog::record('custom_report.reopened_signed', [
                'subject_type' => CustomInspectionReport::class,
                'subject_id' => $report->id,
                'meta' => [
                    'ir_number' => $report->ir_number,
                    'user_id' => $admin->id,
                    'reason' => $reason,
                ],
            ]);

            return $report->fresh();
        });
    }
}
