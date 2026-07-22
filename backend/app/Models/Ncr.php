<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Non-Conformance Report — created when a Form 3 or Custom Report row
 * fails inspection and needs formal disposition.
 *
 * Created exclusively via NcrService::createFromRow() or ::create() so
 * the auto-numbering (NCR-YYYY-NNNN) stays consistent and the audit log
 * entry always fires. Never instantiate directly from controllers.
 */
class Ncr extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'ncrs';

    public const SEVERITY_MINOR = 'minor';
    public const SEVERITY_MAJOR = 'major';
    public const SEVERITY_CRITICAL = 'critical';

    public const SEVERITIES = [
        self::SEVERITY_MINOR,
        self::SEVERITY_MAJOR,
        self::SEVERITY_CRITICAL,
    ];

    public const DISPOSITION_PENDING = 'pending';
    public const DISPOSITION_REWORK = 'rework';
    public const DISPOSITION_SCRAP = 'scrap';
    public const DISPOSITION_USE_AS_IS = 'use_as_is';
    public const DISPOSITION_RETURN_TO_VENDOR = 'return_to_vendor';
    public const DISPOSITION_NO_DEFECT_FOUND = 'no_defect_found';

    public const DISPOSITIONS = [
        self::DISPOSITION_PENDING,
        self::DISPOSITION_REWORK,
        self::DISPOSITION_SCRAP,
        self::DISPOSITION_USE_AS_IS,
        self::DISPOSITION_RETURN_TO_VENDOR,
        self::DISPOSITION_NO_DEFECT_FOUND,
    ];

    public const STATUS_OPEN = 'open';
    public const STATUS_DISPOSITIONED = 'dispositioned';
    public const STATUS_CLOSED = 'closed';

    public const STATUSES = [
        self::STATUS_OPEN,
        self::STATUS_DISPOSITIONED,
        self::STATUS_CLOSED,
    ];

    protected $fillable = [
        'ncr_number',
        'part_id',
        'inspection_session_id',
        'source_type',
        'source_id',
        'characteristic_ref',
        'requirement',
        'actual_result',
        'unit',
        'severity',
        'cause',
        'disposition',
        'disposition_notes',
        'status',
        'closure_notes',
        'created_by',
        'dispositioned_by',
        'dispositioned_at',
        'closed_by',
        'closed_at',
    ];

    protected $casts = [
        'dispositioned_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    public function part(): BelongsTo
    {
        return $this->belongsTo(Part::class);
    }

    public function inspectionSession(): BelongsTo
    {
        return $this->belongsTo(InspectionSession::class);
    }

    public function source(): MorphTo
    {
        return $this->morphTo();
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'created_by');
    }

    public function dispositioner(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'dispositioned_by');
    }

    public function closer(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'closed_by');
    }

    public function isOpen(): bool
    {
        return $this->status === self::STATUS_OPEN;
    }

    public function isDispositioned(): bool
    {
        return $this->status === self::STATUS_DISPOSITIONED;
    }

    public function isClosed(): bool
    {
        return $this->status === self::STATUS_CLOSED;
    }
}
