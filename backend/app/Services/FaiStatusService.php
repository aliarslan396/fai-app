<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\FaiForm1;
use App\Models\TenantUser;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

/**
 * AS9102 FAI status lifecycle per doc Section 3.4:
 *
 *   in_work ──submit──▶ submitted
 *   submitted ──accept──▶ accepted  (via signature — SignatureService handles)
 *   submitted ──return──▶ returned  (QA Manager rejects, provides reason)
 *   returned ──resubmit──▶ submitted (inspector fixes and resubmits)
 *   accepted ──reopen(admin)──▶ in_work (formal request, cascades unlock)
 *
 * Rules:
 *   - Returned status requires a written reason (doc: "Returned status
 *     requires written reason displayed to originating inspector")
 *   - Accepted locks all records (doc: "Accepted status locks all records —
 *     re-open requires formal request")
 *   - Signature service is the ONLY way to transition to `accepted` — it
 *     couples the state change with the audit-safe sign event
 *
 * Every mutation goes through this service so state machine invariants
 * are enforced in one place and every transition emits an AuditLog row.
 */
class FaiStatusService
{
    public const STATUS_IN_WORK = 'in_work';
    public const STATUS_SUBMITTED = 'submitted';
    public const STATUS_RETURNED = 'returned';
    public const STATUS_ACCEPTED = 'accepted';

    public const STATUSES = [
        self::STATUS_IN_WORK,
        self::STATUS_SUBMITTED,
        self::STATUS_RETURNED,
        self::STATUS_ACCEPTED,
    ];

    /**
     * Inspector marks the form complete and sends to QA Manager for review.
     * Allowed from: in_work OR returned (resubmit after fixes).
     */
    public function submit(TenantUser $user, FaiForm1 $form): FaiForm1
    {
        if ($form->isLocked()) {
            throw new RuntimeException('Cannot submit a locked form.');
        }

        if (! in_array($form->status, [self::STATUS_IN_WORK, self::STATUS_RETURNED], true)) {
            throw new RuntimeException("Cannot submit form in status: {$form->status}");
        }

        return DB::transaction(function () use ($user, $form) {
            $form->update([
                'status' => self::STATUS_SUBMITTED,
                'returned_reason' => null, // clear old reason on resubmit
            ]);

            AuditLog::record('fai.submitted', [
                'subject_type' => FaiForm1::class,
                'subject_id' => $form->id,
                'meta' => [
                    'fai_number' => $form->fai_number,
                    'user_id' => $user->id,
                    'from' => $form->getOriginal('status'),
                ],
            ]);

            return $form->fresh();
        });
    }

    /**
     * QA Manager rejects a submitted form with a written reason.
     * Only allowed from: submitted.
     * Reason is REQUIRED per doc 3.4.
     */
    public function returnForRework(TenantUser $user, FaiForm1 $form, string $reason): FaiForm1
    {
        if ($form->status !== self::STATUS_SUBMITTED) {
            throw new RuntimeException("Can only return a form that has been submitted. Current status: {$form->status}");
        }

        $reason = trim($reason);
        if ($reason === '') {
            throw new InvalidArgumentException('Return reason is required — inspector needs to know why.');
        }

        return DB::transaction(function () use ($user, $form, $reason) {
            $form->update([
                'status' => self::STATUS_RETURNED,
                'returned_reason' => $reason,
            ]);

            AuditLog::record('fai.returned', [
                'subject_type' => FaiForm1::class,
                'subject_id' => $form->id,
                'meta' => [
                    'fai_number' => $form->fai_number,
                    'user_id' => $user->id,
                    'reason' => $reason,
                ],
            ]);

            return $form->fresh();
        });
    }

    /**
     * Admin-only formal reopen of an accepted (locked) form.
     * Cascades: unlocks form, clears sign metadata references so the
     * form can be edited again. Existing signatures are preserved but
     * flagged as historical by the audit log.
     */
    public function reopen(TenantUser $user, FaiForm1 $form, string $reason): FaiForm1
    {
        if ($form->status !== self::STATUS_ACCEPTED) {
            throw new RuntimeException("Can only reopen accepted forms. Current status: {$form->status}");
        }

        $reason = trim($reason);
        if ($reason === '') {
            throw new InvalidArgumentException('Reopen reason is required for audit trail.');
        }

        return DB::transaction(function () use ($user, $form, $reason) {
            $form->update([
                'status' => self::STATUS_IN_WORK,
                'locked' => false,
                'locked_at' => null,
                'locked_by' => null,
                'returned_reason' => null,
            ]);

            AuditLog::record('fai.reopened', [
                'subject_type' => FaiForm1::class,
                'subject_id' => $form->id,
                'meta' => [
                    'fai_number' => $form->fai_number,
                    'user_id' => $user->id,
                    'reason' => $reason,
                ],
            ]);

            return $form->fresh();
        });
    }

    /**
     * Called by SignatureService after a successful sign — flips status
     * to accepted. Not exposed via controller — only signature path
     * can accept, guaranteeing every acceptance is coupled to an
     * audit-safe signature event.
     */
    public function markAcceptedFromSign(FaiForm1 $form): void
    {
        // Only apply if form was submitted or in_work — don't clobber other
        // transitions if for some reason the form is already accepted.
        if (! in_array($form->status, [self::STATUS_IN_WORK, self::STATUS_SUBMITTED, self::STATUS_RETURNED], true)) {
            return;
        }

        $form->update(['status' => self::STATUS_ACCEPTED]);
    }
}
