<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Gauge;
use App\Models\GaugeCalibration;
use App\Models\TenantUser;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;

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
                // Failed cal auto-pulls gauge out of service
                if ($calibration->result === GaugeCalibration::RESULT_FAIL_OOT) {
                    $gauge->out_of_service = true;
                    $gauge->out_of_service_reason = 'Failed calibration on ' . $calibration->calibrated_at
                        . ' (OOT) — cert ' . ($calibration->cert_number ?? 'N/A');
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
