<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Gauge master record per doc Section 3.11.
 *
 * Status is DERIVED (never persisted) so a gauge that's due today
 * flips to "due" automatically without needing a scheduled job.
 * Uses the 14-day warning window from the spec.
 */
class Gauge extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'gauges';

    public const STATUS_CURRENT = 'current';
    public const STATUS_DUE = 'due';
    public const STATUS_OVERDUE = 'overdue';
    public const STATUS_OUT_OF_SERVICE = 'out_of_service';

    public const STATUSES = [
        self::STATUS_CURRENT,
        self::STATUS_DUE,
        self::STATUS_OVERDUE,
        self::STATUS_OUT_OF_SERVICE,
    ];

    protected $fillable = [
        'gauge_id',
        'type',
        'manufacturer',
        'model',
        'serial_number',
        'range',
        'resolution',
        'location',
        'calibration_interval_months',
        'last_calibrated_at',
        'next_cal_due',
        'out_of_service',
        'out_of_service_reason',
        'created_by',
    ];

    protected $casts = [
        'last_calibrated_at' => 'date',
        'next_cal_due' => 'date',
        'out_of_service' => 'boolean',
        'calibration_interval_months' => 'integer',
    ];

    protected $appends = ['status', 'days_until_due'];

    public function calibrations(): HasMany
    {
        return $this->hasMany(GaugeCalibration::class)->orderByDesc('calibrated_at');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'created_by');
    }

    /**
     * Derived calibration status per doc Section 3.11:
     *   current (>14 days remaining) / due (within 14 days) /
     *   overdue / out_of_service.
     */
    public function getStatusAttribute(): string
    {
        if ($this->out_of_service) {
            return self::STATUS_OUT_OF_SERVICE;
        }
        if (! $this->next_cal_due) {
            return self::STATUS_OVERDUE; // no calibration on record — treat as overdue
        }

        $daysLeft = $this->getDaysUntilDueAttribute();
        if ($daysLeft < 0) {
            return self::STATUS_OVERDUE;
        }
        if ($daysLeft <= 14) {
            return self::STATUS_DUE;
        }
        return self::STATUS_CURRENT;
    }

    public function getDaysUntilDueAttribute(): ?int
    {
        if (! $this->next_cal_due) {
            return null;
        }
        return (int) Carbon::today()->diffInDays($this->next_cal_due, false);
    }
}
