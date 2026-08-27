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
 *   1. Re-verifies the user's password (non-repudiation)
 *   2. Saves the canvas image (data: URL -> PNG)
 *   3. Generates the QA stamp PNG via StampGenerator
 *   4. Locks the parent form (locked_at, locked_by)
 *   5. Records an AuditLog entry
 * All inside a DB transaction.
 */
class SignatureService
{
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

        if (method_exists($signable, 'isLocked') && $signable->isLocked()) {
            throw new RuntimeException('Form is already locked — cannot sign again');
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

        return DB::transaction(function () use ($user, $signable, $canvasData, $role, $ip, $userAgent) {
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

            // Lock the parent form (idempotent — first signature locks,
            // subsequent signatures from other roles don't re-lock).
            if (
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

                // Doc 3.4: signing an AS9102 FAI transitions status to
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
