<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Impact assessment written after a failing (OOT) calibration.
 *
 * Bound 1:1 to the failing GaugeCalibration row via calibration_id
 * unique index. Optional NCR link points to the quarantine ticket
 * for parts the bad gauge measured.
 */
class GaugeOotAssessment extends Model
{
    use HasFactory;

    public const DISPOSITION_ACCEPT_AS_IS = 'accept_as_is';
    public const DISPOSITION_RECALL = 'recall';
    public const DISPOSITION_INVESTIGATE = 'investigate';
    public const DISPOSITION_NO_IMPACT = 'no_impact';

    public const DISPOSITIONS = [
        self::DISPOSITION_ACCEPT_AS_IS,
        self::DISPOSITION_RECALL,
        self::DISPOSITION_INVESTIGATE,
        self::DISPOSITION_NO_IMPACT,
    ];

    protected $fillable = [
        'gauge_id',
        'calibration_id',
        'last_known_good_at',
        'parts_at_risk_summary',
        'impact_analysis',
        'containment_action',
        'ncr_id',
        'disposition',
        'assessed_by',
        'assessed_at',
    ];

    protected $casts = [
        'last_known_good_at' => 'date',
        'assessed_at' => 'datetime',
    ];

    public function gauge(): BelongsTo
    {
        return $this->belongsTo(Gauge::class);
    }

    public function calibration(): BelongsTo
    {
        return $this->belongsTo(GaugeCalibration::class);
    }

    public function ncr(): BelongsTo
    {
        return $this->belongsTo(Ncr::class);
    }

    public function assessor(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'assessed_by');
    }
}
