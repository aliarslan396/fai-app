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
    // MRB (Material Review Board) — aerospace-standard multi-signature
    // disposition for ambiguous defects. Replaces the old
    // `no_defect_found` value per doc 3.10.
    public const DISPOSITION_MRB = 'mrb';

    public const DISPOSITIONS = [
        self::DISPOSITION_PENDING,
        self::DISPOSITION_REWORK,
        self::DISPOSITION_SCRAP,
        self::DISPOSITION_USE_AS_IS,
        self::DISPOSITION_RETURN_TO_VENDOR,
        self::DISPOSITION_MRB,
    ];

    public const STATUS_OPEN = 'open';
    public const STATUS_DISPOSITIONED = 'dispositioned';
    public const STATUS_CLOSED = 'closed';

    public const STATUSES = [
        self::STATUS_OPEN,
        self::STATUS_DISPOSITIONED,
        self::STATUS_CLOSED,
    ];

    // Where in the process the defect was caught. AS9100 key metric —
    // `customer` = escape event (worst case). `incoming` = supplier issue.
    public const DETECTION_INCOMING = 'incoming';
    public const DETECTION_IN_PROCESS = 'in_process';
    public const DETECTION_FINAL = 'final';
    public const DETECTION_CUSTOMER = 'customer';

    public const DETECTION_POINTS = [
        self::DETECTION_INCOMING,
        self::DETECTION_IN_PROCESS,
        self::DETECTION_FINAL,
        self::DETECTION_CUSTOMER,
    ];

    protected $fillable = [
        'ncr_number',
        'part_id',
        'inspection_session_id',
        'lot_serial',
        'quantity_affected',
        'defect_code',
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
        'material_cost',
        'labor_hours',
        'scrap_value',
        'capa_id',
        'created_by',
        'detected_by',
        'detection_point',
        'dispositioned_by',
        'dispositioned_at',
        'verified_by',
        'verified_at',
        'verification_notes',
        'closed_by',
        'closed_at',
    ];

    protected $casts = [
        'dispositioned_at' => 'datetime',
        'verified_at' => 'datetime',
        'closed_at' => 'datetime',
        'quantity_affected' => 'integer',
        'material_cost' => 'decimal:2',
        'labor_hours' => 'decimal:2',
        'scrap_value' => 'decimal:2',
    ];

    protected $appends = ['cost_of_quality'];

    /**
     * Total cost of quality = material_cost + (labor_hours * hourly rate)
     * + scrap_value. Hourly rate is a reasonable industry default ($75/hr);
     * per-tenant customization can land later without breaking the API.
     */
    public function getCostOfQualityAttribute(): float
    {
        $material = (float) ($this->material_cost ?? 0);
        $labor = (float) ($this->labor_hours ?? 0) * 75.0;
        $scrap = (float) ($this->scrap_value ?? 0);
        return round($material + $labor + $scrap, 2);
    }

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

    public function detector(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'detected_by');
    }

    public function dispositioner(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'dispositioned_by');
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'verified_by');
    }

    public function closer(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'closed_by');
    }

    public function attachments()
    {
        return $this->hasMany(NcrAttachment::class)->orderByDesc('created_at');
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

    public function isVerified(): bool
    {
        return $this->verified_at !== null;
    }
}
