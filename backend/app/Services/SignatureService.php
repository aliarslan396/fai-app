<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\FaiForm1;
use App\Models\Signature;
use App\Models\TenantUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;

/**
 * Orchestrates signing a form. Single entry point — never instantiate
 * Signature directly from controllers. The service:
 *   1. Enforces the signature-row rules (see below)
 *   2. Re-verifies the user's password (non-repudiation)
 *   3. Saves the canvas image (data: URL -> PNG)
 *   4. Generates the QA stamp PNG via StampGenerator
 *   5. Mirrors the signer into the AS9102 Form 1 signature rows 20-25
 *   6. Locks the parent form (locked_at, locked_by)
 *   7. Records an AuditLog entry
 * All inside a DB transaction.
 *
 * AS9102 Rev C Form 1 carries three signature rows:
 *   fields 20-21  Verified By        -> Signature::ROLE_INSPECTOR
 *   fields 22-23  Reviewed By        -> Signature::ROLE_QA_MANAGER
 *   fields 24-25  Customer Approval  -> Signature::ROLE_CUSTOMER_REP
 *
 * Rules enforced here:
 *   - A role can only be signed once per form.
 *   - One person may not sign two different rows on the same form
 *     (segregation of duties — an inspector cannot also be the reviewer).
 *   - The QA Manager row is the acceptance event: it flips the FAI to
 *     `accepted` and locks the form against edits.
 *   - Customer Approval may still be captured after acceptance, since
 *     customer sign-off routinely lands after the shop accepts
 *     internally. Every other role is blocked once locked.
 * Single-signature forms (Custom Inspection Report) keep the original
 * behaviour: the first signature locks the document outright.
 */
class SignatureService
{
    /** AS9102 Form 1 signature-row columns, keyed by signature role. */
    private const FORM1_ROW_COLUMNS = [
        Signature::ROLE_INSPECTOR => ['field20_verified_by_name', 'field21_verified_at'],
        Signature::ROLE_QA_MANAGER => ['field22_reviewed_by_name', 'field23_reviewed_at'],
        Signature::ROLE_CUSTOMER_REP => ['field24_customer_approval_name', 'field25_customer_approval_at'],
    ];

    private const ROLE_LABELS = [
        Signature::ROLE_INSPECTOR => 'Verified By (field 20)',
        Signature::ROLE_QA_MANAGER => 'Reviewed By (field 22)',
        Signature::ROLE_CUSTOMER_REP => 'Customer Approval (field 24)',
    ];

    public function __construct(
        private StampGenerator $stamper,
        private FaiStatusService $faiStatus,
    ) {}

    /**
     * @param  TenantUser  $user        User who is signing
     * @param  Model       $signable    FaiForm1 | CustomInspectionReport (must have signatures() + lock columns)
     * @param  string      $canvasData  data: URL or raw base64 PNG from <SignaturePad>
     * @param  string      $role        Signature::ROLE_* constant
     * @param  string      $password    User's plaintext password for re-verification
     * @param  string      $ip
     * @param  string      $userAgent
     */
    public function sign(
        TenantUser $user,
        Model $signable,
        string $canvasData,
        string $role,
        string $password,
        string $ip,
        string $userAgent,
    ): Signature {
        if (! in_array($role, Signature::ROLES, true)) {
            throw new InvalidArgumentException("Invalid signature role: {$role}");
        }

        $isForm1 = $signable instanceof FaiForm1;

        if (method_exists($signable, 'isLocked') && $signable->isLocked()) {
            // Customer approval is the one row that may legitimately land
            // after the QA Manager has accepted + locked the FAI.
            $customerApprovalOnLockedForm1 = $isForm1 && $role === Signature::ROLE_CUSTOMER_REP;
            if (! $customerApprovalOnLockedForm1) {
                throw new RuntimeException('Form is already locked — cannot sign again');
            }
        }

        $existing = $signable->signatures()->get();

        if ($existing->firstWhere('signature_role', $role)) {
            $label = self::ROLE_LABELS[$role] ?? $role;
            throw new RuntimeException("This form has already been signed as {$label}.");
        }

        // Segregation of duties: the same person must not sign two rows.
        $priorByThisUser = $existing->firstWhere('signed_by', $user->id);
        if ($priorByThisUser) {
            $priorLabel = self::ROLE_LABELS[$priorByThisUser->signature_role] ?? $priorByThisUser->signature_role;
            $thisLabel = self::ROLE_LABELS[$role] ?? $role;
            throw new RuntimeException(
                "You already signed this form as {$priorLabel}. A different person must sign as {$thisLabel}."
            );
        }

        // Doc 3.4: FAI signing = acceptance. Requires status=submitted so
        // the QA Manager review step cannot be bypassed. `in_work` and
        // `returned` must go through Submit for Review first.
        if ($signable instanceof FaiForm1 && ! in_array($signable->status, ['submitted', 'accepted'], true)) {
            throw new RuntimeException("Cannot sign — form must be submitted for review first. Current status: {$signable->status}");
        }
        // Doc 3.5: Custom Report must reach Complete before it can be signed.
        if ($signable instanceof \App\Models\CustomInspectionReport
            && ! in_array($signable->status, ['complete', 'signed'], true)) {
            throw new RuntimeException("Cannot sign — report must be marked complete first. Current status: {$signable->status}");
        }

        if (! Hash::check($password, $user->password)) {
            throw new RuntimeException('Password verification failed');
        }

        return DB::transaction(function () use ($user, $signable, $canvasData, $role, $ip, $userAgent, $isForm1) {
            $sigPath = $this->saveCanvasImage($canvasData);
            $faiOrIr = $this->extractIdentifier($signable);
            $company = optional(tenant())->company_name ?? optional(tenant())->id ?? null;
            $stampPath = $this->stamper->build($user, null, $faiOrIr, $company);
            $now = now();

            $signature = Signature::create([
                'signable_type' => get_class($signable),
                'signable_id' => $signable->getKey(),
                'signature_role' => $role,
                'signed_by' => $user->id,
                'signed_at' => $now,
                'signature_image_path' => $sigPath,
                'stamp_image_path' => $stampPath,
                'ip_address' => $ip,
                'user_agent' => substr($userAgent, 0, 500),
                'password_verified_at' => $now,
            ]);

            // Mirror the signer into the printed AS9102 Form 1 signature
            // rows so the exported Excel/PDF carries fields 20-25 instead
            // of rendering them blank.
            if ($isForm1 && isset(self::FORM1_ROW_COLUMNS[$role])) {
                [$nameColumn, $atColumn] = self::FORM1_ROW_COLUMNS[$role];
                $signable->forceFill([
                    $nameColumn => $user->name,
                    $atColumn => $now,
                ])->save();
            }

            // Lock the parent form. On AS9102 Form 1 the QA Manager review
            // is the acceptance event, so only that role locks — the
            // inspector signs first and must not freeze the form before
            // review. Every other signable locks on its first signature.
            $shouldLock = $isForm1
                ? $role === Signature::ROLE_QA_MANAGER
                : true;

            if (
                $shouldLock &&
                method_exists($signable, 'isLocked') &&
                in_array('locked_at', $signable->getFillable(), true) &&
                $signable->locked_at === null
            ) {
                $updates = [
                    'locked_at' => $now,
                    'locked_by' => $user->id,
                ];
                // Also flip the legacy boolean flag so older frontend reads
                // that check ->locked directly see the lock.
                if (in_array('locked', $signable->getFillable(), true)) {
                    $updates['locked'] = true;
                }
                $signable->update($updates);

                // Doc 3.4: QA Manager review transitions the AS9102 FAI to
                // `accepted`. Signature is the ONLY path to acceptance.
                if ($signable instanceof FaiForm1) {
                    $this->faiStatus->markAcceptedFromSign($signable);
                }
                // Doc 3.5: signing the Custom Report transitions status
                // to `signed`. Signature is the ONLY path.
                if ($signable instanceof \App\Models\CustomInspectionReport) {
                    app(\App\Services\CustomReportStatusService::class)->markSignedFromSign($signable);
                }
            }

            AuditLog::record('form.signed', [
                'subject_type' => get_class($signable),
                'subject_id' => $signable->getKey(),
                'meta' => [
                    'signature_id' => $signature->id,
                    'role' => $role,
                    'user_id' => $user->id,
                ],
            ]);

            return $signature->load('user:id,name,email');
        });
    }

    /**
     * Save a data: URL or raw base64 PNG to storage. Returns the
     * storage-relative path.
     */
    private function saveCanvasImage(string $canvasData): string
    {
        // Strip data: URL prefix if present
        $base64 = preg_replace('#^data:image/\w+;base64,#', '', $canvasData);
        $binary = base64_decode($base64, true);
        if ($binary === false || strlen($binary) < 100) {
            throw new RuntimeException('Empty or invalid signature canvas');
        }

        // Sanity-check it's actually a PNG (first 8 bytes)
        if (substr($binary, 0, 8) !== "\x89PNG\r\n\x1a\n") {
            throw new RuntimeException('Canvas data is not a valid PNG');
        }

        $relativePath = 'signatures/sig_' . Str::uuid() . '.png';
        Storage::disk('local')->put($relativePath, $binary);

        return $relativePath;
    }

    /**
     * Pull the FAI number / IR number off a signable form so the stamp
     * shows a real identifier in the center block.
     */
    private function extractIdentifier(Model $signable): ?string
    {
        if (isset($signable->fai_number)) {
            return (string) $signable->fai_number;
        }
        if (isset($signable->ir_number)) {
            return (string) $signable->ir_number;
        }
        return null;
    }
}
