<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Gauge;
use App\Models\GaugeCalibration;
use App\Models\GaugeCheckout;
use App\Models\GaugeOotAssessment;
use App\Models\TenantUser;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;

/**
 * Single entry point for gauge + calibration mutations.
 *
 * Enforces:
 *   - Gauge status is derived — never written directly
 *   - next_cal_due auto-computed from last_calibrated_at + interval
 *   - Adding a calibration record automatically updates the parent
 *     gauge's last_calibrated_at + next_cal_due (transactional)
 *   - Cert PDF uploads stored on private local disk under gauges/certs/
 *   - Audit log fires on every create + calibration
 */
class GaugeService
{
    public function createGauge(TenantUser $creator, array $data): Gauge
    {
        return DB::transaction(function () use ($creator, $data) {
            $gauge = Gauge::create([
                'gauge_id' => $data['gauge_id'],
                'type' => $data['type'],
                'manufacturer' => $data['manufacturer'] ?? null,
                'model' => $data['model'] ?? null,
                'serial_number' => $data['serial_number'] ?? null,
                'range' => $data['range'] ?? null,
                'resolution' => $data['resolution'] ?? null,
                'location' => $data['location'] ?? null,
                'calibration_interval_months' => $data['calibration_interval_months'] ?? 12,
                'last_calibrated_at' => $data['last_calibrated_at'] ?? null,
                'next_cal_due' => $this->computeNextDue(
                    $data['last_calibrated_at'] ?? null,
                    $data['calibration_interval_months'] ?? 12,
                ),
                'out_of_service' => $data['out_of_service'] ?? false,
                'out_of_service_reason' => $data['out_of_service_reason'] ?? null,
                'created_by' => $creator->id,
            ]);

            AuditLog::record('gauge.created', [
                'subject_type' => Gauge::class,
                'subject_id' => $gauge->id,
                'meta' => [
                    'gauge_id' => $gauge->gauge_id,
                    'type' => $gauge->type,
                    'user_id' => $creator->id,
                ],
            ]);

            return $gauge;
        });
    }

    public function updateGauge(TenantUser $editor, Gauge $gauge, array $data): Gauge
    {
        return DB::transaction(function () use ($editor, $gauge, $data) {
            $updates = array_intersect_key($data, array_flip([
                'gauge_id', 'type', 'manufacturer', 'model', 'serial_number',
                'range', 'resolution', 'location', 'calibration_interval_months',
                'out_of_service', 'out_of_service_reason',
            ]));

            $gauge->update($updates);

            // Recompute next_cal_due if interval changed
            if (isset($data['calibration_interval_months']) && $gauge->last_calibrated_at) {
                $gauge->next_cal_due = $this->computeNextDue(
                    $gauge->last_calibrated_at,
                    $gauge->calibration_interval_months,
                );
                $gauge->save();
            }

            AuditLog::record('gauge.updated', [
                'subject_type' => Gauge::class,
                'subject_id' => $gauge->id,
                'meta' => ['gauge_id' => $gauge->gauge_id, 'user_id' => $editor->id],
            ]);

            return $gauge->fresh();
        });
    }

    /**
     * Record a calibration event. Auto-updates the parent gauge's
     * last_calibrated_at + next_cal_due.
     */
    public function recordCalibration(TenantUser $recorder, Gauge $gauge, array $data, ?UploadedFile $certFile = null): GaugeCalibration
    {
        $this->validateResult($data['result'] ?? GaugeCalibration::RESULT_PASS);

        return DB::transaction(function () use ($recorder, $gauge, $data, $certFile) {
            $certPath = null;
            if ($certFile) {
                $ext = $certFile->getClientOriginalExtension() ?: 'pdf';
                $certPath = 'gauges/certs/cert_' . Str::uuid() . '.' . $ext;
                Storage::disk('local')->put($certPath, file_get_contents($certFile->getRealPath()));
            }

            $calibration = GaugeCalibration::create([
                'gauge_id' => $gauge->id,
                'calibrated_at' => $data['calibrated_at'] ?? now()->toDateString(),
                'calibrated_by' => $data['calibrated_by'],
                'cert_number' => $data['cert_number'] ?? null,
                'cert_file_path' => $certPath,
                'as_found' => $data['as_found'] ?? null,
                'as_left' => $data['as_left'] ?? null,
                'result' => $data['result'] ?? GaugeCalibration::RESULT_PASS,
                'notes' => $data['notes'] ?? null,
                'recorded_by' => $recorder->id,
            ]);

            // Update parent gauge — only if this is the most recent calibration
            $calDate = Carbon::parse($calibration->calibrated_at);
            if (! $gauge->last_calibrated_at || $calDate->greaterThanOrEqualTo(Carbon::parse($gauge->last_calibrated_at))) {
                $gauge->last_calibrated_at = $calibration->calibrated_at;
                $gauge->next_cal_due = $this->computeNextDue(
                    $calibration->calibrated_at,
                    $gauge->calibration_interval_months,
                );
                // Failed cal auto-pulls gauge out of service.
                if ($calibration->result === GaugeCalibration::RESULT_FAIL_OOT) {
                    $gauge->out_of_service = true;
                    $gauge->out_of_service_reason = 'Failed calibration on ' . $calibration->calibrated_at
                        . ' (OOT) — cert ' . ($calibration->cert_number ?? 'N/A');
                }
                // Pass cal auto-returns to service ONLY when the OOS was
                // itself cal-caused (system-set reason). Physical-damage
                // or manually-flagged OOS stays OOS until a human clears
                // it — we don't second-guess a human-authored reason.
                elseif ($calibration->result === GaugeCalibration::RESULT_PASS
                    && $gauge->out_of_service
                    && $this->isCalRelatedOosReason($gauge->out_of_service_reason)) {
                    $gauge->out_of_service = false;
                    $gauge->out_of_service_reason = null;
                }
                $gauge->save();
            }

            AuditLog::record('gauge.calibrated', [
                'subject_type' => Gauge::class,
                'subject_id' => $gauge->id,
                'meta' => [
                    'gauge_id' => $gauge->gauge_id,
                    'calibration_id' => $calibration->id,
                    'result' => $calibration->result,
                    'user_id' => $recorder->id,
                ],
            ]);

            return $calibration;
        });
    }

    // -------------------------------------------------------------- OOT

    /**
     * Log an impact assessment against a failing calibration. Enforces
     * one assessment per calibration (calibration_id is unique).
     */
    public function recordOotAssessment(TenantUser $assessor, GaugeCalibration $cal, array $data): GaugeOotAssessment
    {
        if ($cal->result !== GaugeCalibration::RESULT_FAIL_OOT) {
            throw new RuntimeException('Impact assessments can only be logged against failed (OOT) calibrations.');
        }
        if (empty($data['impact_analysis'])) {
            throw new InvalidArgumentException('Impact analysis is required.');
        }
        if (empty($data['disposition']) || ! in_array($data['disposition'], GaugeOotAssessment::DISPOSITIONS, true)) {
            throw new InvalidArgumentException('Valid disposition is required.');
        }

        if (GaugeOotAssessment::where('calibration_id', $cal->id)->exists()) {
            throw new RuntimeException('An impact assessment already exists for this calibration.');
        }

        return DB::transaction(function () use ($assessor, $cal, $data) {
            $assessment = GaugeOotAssessment::create([
                'gauge_id' => $cal->gauge_id,
                'calibration_id' => $cal->id,
                'last_known_good_at' => $data['last_known_good_at'] ?? null,
                'parts_at_risk_summary' => $data['parts_at_risk_summary'] ?? null,
                'impact_analysis' => $data['impact_analysis'],
                'containment_action' => $data['containment_action'] ?? null,
                'ncr_id' => $data['ncr_id'] ?? null,
                'disposition' => $data['disposition'],
                'assessed_by' => $assessor->id,
                'assessed_at' => now(),
            ]);

            AuditLog::record('gauge.oot_assessed', [
                'subject_type' => Gauge::class,
                'subject_id' => $cal->gauge_id,
                'meta' => [
                    'assessment_id' => $assessment->id,
                    'calibration_id' => $cal->id,
                    'disposition' => $assessment->disposition,
                    'ncr_id' => $assessment->ncr_id,
                    'user_id' => $assessor->id,
                ],
            ]);

            return $assessment->fresh(['assessor:id,name', 'ncr:id,ncr_number']);
        });
    }

    // -------------------------------------------------------------- Checkout

    public function checkOut(TenantUser $creator, Gauge $gauge, array $data): GaugeCheckout
    {
        if ($gauge->out_of_service) {
            throw new RuntimeException("Gauge {$gauge->gauge_id} is out of service and cannot be checked out.");
        }
        if (GaugeCheckout::where('gauge_id', $gauge->id)->whereNull('checked_in_at')->exists()) {
            throw new RuntimeException("Gauge {$gauge->gauge_id} is already checked out. Check it in first.");
        }
        if (empty($data['checked_out_to'])) {
            throw new InvalidArgumentException('checked_out_to (user id) is required.');
        }

        return DB::transaction(function () use ($creator, $gauge, $data) {
            $checkout = GaugeCheckout::create([
                'gauge_id' => $gauge->id,
                'checked_out_to' => $data['checked_out_to'],
                'job_reference' => $data['job_reference'] ?? null,
                'checked_out_at' => now(),
                'notes' => $data['notes'] ?? null,
                'created_by' => $creator->id,
            ]);

            AuditLog::record('gauge.checked_out', [
                'subject_type' => Gauge::class,
                'subject_id' => $gauge->id,
                'meta' => [
                    'checkout_id' => $checkout->id,
                    'to_user_id' => $checkout->checked_out_to,
                    'job_reference' => $checkout->job_reference,
                    'user_id' => $creator->id,
                ],
            ]);

            return $checkout->fresh(['holder:id,name']);
        });
    }

    public function checkIn(TenantUser $user, GaugeCheckout $checkout, ?string $notes = null): GaugeCheckout
    {
        if ($checkout->checked_in_at) {
            throw new RuntimeException('This checkout is already closed.');
        }

        return DB::transaction(function () use ($user, $checkout, $notes) {
            $checkout->checked_in_at = now();
            $checkout->checked_in_by = $user->id;
            if ($notes !== null && $notes !== '') {
                $checkout->notes = trim(($checkout->notes ? $checkout->notes . "\n\n" : '') . "[Check-in] " . $notes);
            }
            $checkout->save();

            AuditLog::record('gauge.checked_in', [
                'subject_type' => Gauge::class,
                'subject_id' => $checkout->gauge_id,
                'meta' => [
                    'checkout_id' => $checkout->id,
                    'user_id' => $user->id,
                ],
            ]);

            return $checkout->fresh(['holder:id,name', 'returner:id,name']);
        });
    }

    // -------------------------------------------------------------- helpers

    /**
     * True when the OOS reason looks like a system-set cal failure —
     * safe to auto-clear when a fresh pass cal lands. False for
     * human-authored reasons (physical damage, retired, etc.), which
     * must be cleared manually so the human confirms the fix.
     */
    private function isCalRelatedOosReason(?string $reason): bool
    {
        if (! $reason) {
            return true; // no reason recorded — treat as cal-related
        }
        $lower = strtolower($reason);
        return str_contains($lower, 'failed calibration')
            || str_contains($lower, 'oot')
            || str_contains($lower, 'overdue');
    }

    private function computeNextDue(mixed $lastCalibrated, int $intervalMonths): ?string
    {
        if (! $lastCalibrated) {
            return null;
        }
        return Carbon::parse($lastCalibrated)->addMonths($intervalMonths)->toDateString();
    }

    private function validateResult(string $result): void
    {
        if (! in_array($result, GaugeCalibration::RESULTS, true)) {
            throw new InvalidArgumentException("Invalid calibration result: {$result}");
        }
    }
}
