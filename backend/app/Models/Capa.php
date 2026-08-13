<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * CAPA — Corrective And Preventive Action.
 *
 * Root-cause investigation triggered when an NCR (or a pattern of
 * NCRs) shows a systematic issue. Doc 3.10 / 4.7 mandate a formal
 * workflow with 5-Why analysis, action plan, approval, and
 * effectiveness review. This stub carries the plumbing; full 5-tab
 * UI + workflow gates ship in Sprint 2.
 *
 * Created exclusively via CapaService::createFromNcr() so the
 * CAPA-YYYY-NNNN sequence stays race-safe.
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

    protected $fillable = [
        'capa_number',
        'source_ncr_id',
        'part_id',
        'defect_code',
        'problem_statement',
        'status',
        'created_by',
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
}
