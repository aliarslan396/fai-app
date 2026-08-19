<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * CAPA — Corrective And Preventive Action.
 *
 * Root-cause investigation triggered when an NCR (or a pattern of
 * NCRs) shows a systematic issue. Doc 3.10 / 4.7. Full 5-tab UI +
 * state machine live now (Sprint 2).
 *
 * Created exclusively via CapaService::createFromNcr() so the
 * CAPA-YYYY-NNNN sequence stays race-safe. All workflow mutations
 * go through CapaService methods so state guards + audit fire.
 */
class Capa extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'capas';

    public const STATUS_OPEN = 'open';
    public const STATUS_ROOT_CAUSE_PENDING = 'root_cause_pending';
    public const STATUS_ACTION_PLAN_PENDING = 'action_plan_pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_IN_PROGRESS = 'in_progress';
    public const STATUS_CLOSED = 'closed';
    public const STATUS_INEFFECTIVE = 'ineffective';

    public const STATUSES = [
        self::STATUS_OPEN,
        self::STATUS_ROOT_CAUSE_PENDING,
        self::STATUS_ACTION_PLAN_PENDING,
        self::STATUS_APPROVED,
        self::STATUS_IN_PROGRESS,
        self::STATUS_CLOSED,
        self::STATUS_INEFFECTIVE,
    ];

    public const SOURCE_NCR = 'ncr';
    public const SOURCE_AUDIT = 'audit';
    public const SOURCE_CUSTOMER = 'customer';
    public const SOURCE_INTERNAL = 'internal';

    public const SOURCES = [
        self::SOURCE_NCR,
        self::SOURCE_AUDIT,
        self::SOURCE_CUSTOMER,
        self::SOURCE_INTERNAL,
    ];

    public const EFFECTIVENESS_EFFECTIVE = 'effective';
    public const EFFECTIVENESS_INEFFECTIVE = 'ineffective';
    public const EFFECTIVENESS_PARTIAL = 'partial';

    public const EFFECTIVENESS_RESULTS = [
        self::EFFECTIVENESS_EFFECTIVE,
        self::EFFECTIVENESS_INEFFECTIVE,
        self::EFFECTIVENESS_PARTIAL,
    ];

    protected $fillable = [
        'capa_number',
        'source',
        'source_ncr_id',
        'part_id',
        'defect_code',
        'problem_statement',
        'containment_action',
        'root_cause_summary',
        'approved_by',
        'approved_at',
        'effectiveness_review_date',
        'effectiveness_result',
        'effectiveness_notes',
        'closed_by',
        'closed_at',
        'status',
        'created_by',
    ];

    protected $casts = [
        'approved_by' => 'array',
        'approved_at' => 'datetime',
        'effectiveness_review_date' => 'date',
        'closed_at' => 'datetime',
    ];

    public function sourceNcr(): BelongsTo
    {
        return $this->belongsTo(Ncr::class, 'source_ncr_id');
    }

    public function part(): BelongsTo
    {
        return $this->belongsTo(Part::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'created_by');
    }

    public function closer(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'closed_by');
    }

    public function fiveWhys(): HasMany
    {
        return $this->hasMany(CapaFiveWhy::class)->orderBy('level');
    }

    public function actions(): HasMany
    {
        return $this->hasMany(CapaAction::class)->orderBy('created_at');
    }
}
