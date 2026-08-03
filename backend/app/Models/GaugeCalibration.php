<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One calibration event per row. Includes as-found / as-left readings,
 * cert PDF, and optional OOT → NCR escalation link (populated Phase 3).
 */
class GaugeCalibration extends Model
{
    use HasFactory;

    public const RESULT_PASS = 'pass';
    public const RESULT_FAIL_OOT = 'fail_oot';
    public const RESULT_LIMITED_USE = 'limited_use';

    public const RESULTS = [
        self::RESULT_PASS,
        self::RESULT_FAIL_OOT,
        self::RESULT_LIMITED_USE,
    ];

    protected $fillable = [
        'gauge_id',
        'calibrated_at',
        'calibrated_by',
        'cert_number',
        'cert_file_path',
        'as_found',
        'as_left',
        'result',
        'notes',
        'ncr_id',
        'recorded_by',
    ];

    protected $casts = [
        'calibrated_at' => 'date',
    ];

    public function gauge(): BelongsTo
    {
        return $this->belongsTo(Gauge::class);
    }

    public function ncr(): BelongsTo
    {
        return $this->belongsTo(Ncr::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'recorded_by');
    }
}
