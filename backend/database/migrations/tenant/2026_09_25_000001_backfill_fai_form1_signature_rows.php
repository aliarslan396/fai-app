<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Backfill for the AS9102 Form 1 signature-row fix.
 *
 * Before this change the first signature of ANY role locked the form,
 * which had two consequences for existing data:
 *
 *   1. Printed fields 20-25 (Verified By / Reviewed By / Customer
 *      Approval) were never written, so every exported Excel/PDF shows
 *      blank signature rows even where a signature exists.
 *   2. A form whose only signature came from an inspector (or customer
 *      rep) got locked before QA Manager review, leaving it permanently
 *      unable to reach a compliant accepted state.
 *
 * This migration repairs both: it mirrors existing signature rows into
 * fields 20-25, and releases the lock on any form that was locked
 * without a QA Manager signature so the review can still be captured.
 * Forms that do have a QA Manager signature keep their lock + status.
 */
return new class extends Migration
{
    private const ROW_COLUMNS = [
        'inspector' => ['field20_verified_by_name', 'field21_verified_at'],
        'qa_manager' => ['field22_reviewed_by_name', 'field23_reviewed_at'],
        'customer_rep' => ['field24_customer_approval_name', 'field25_customer_approval_at'],
    ];

    public function up(): void
    {
        $signatures = DB::table('signatures')
            ->leftJoin('users', 'users.id', '=', 'signatures.signed_by')
            ->where('signatures.signable_type', \App\Models\FaiForm1::class)
            ->select(
                'signatures.signable_id',
                'signatures.signature_role',
                'signatures.signed_at',
                'users.name as signer_name'
            )
            ->orderBy('signatures.signed_at')
            ->get()
            ->groupBy('signable_id');

        foreach ($signatures as $formId => $formSignatures) {
            $updates = [];
            $hasQaManager = false;

            foreach ($formSignatures as $signature) {
                if (! isset(self::ROW_COLUMNS[$signature->signature_role])) {
                    continue;
                }
                if ($signature->signature_role === 'qa_manager') {
                    $hasQaManager = true;
                }

                [$nameColumn, $atColumn] = self::ROW_COLUMNS[$signature->signature_role];
                $updates[$nameColumn] = $signature->signer_name;
                $updates[$atColumn] = $signature->signed_at;
            }

            // Release a lock that was applied without QA Manager review so
            // the form can still complete its compliant signature chain.
            if (! $hasQaManager) {
                $updates['locked'] = false;
                $updates['locked_at'] = null;
                $updates['locked_by'] = null;
            }

            if ($updates !== []) {
                DB::table('fai_form1')->where('id', $formId)->update($updates);
            }
        }
    }

    public function down(): void
    {
        // Intentionally irreversible: clearing the backfilled signature
        // rows would destroy compliance evidence, and we cannot know
        // which locks were original. The signatures table remains the
        // source of truth, so a re-run of up() is always safe.
    }
};
