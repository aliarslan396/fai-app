<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Action-plan item on a CAPA. Three types per AS9100 §10.2:
 *   - containment: stop the bleeding now
 *   - corrective: fix the root cause of THIS defect
 *   - preventive: change the system to prevent similar defects elsewhere
 *
 * Status flow: pending → in_progress → done | blocked.
 * done requires (completed_at, completed_by) — enforced in service.
 */
class CapaAction extends Model
{
    use HasFactory;

    protected $table = 'capa_actions';

    public const TYPE_CONTAINMENT = 'containment';
    public const TYPE_CORRECTIVE = 'corrective';
    public const TYPE_PREVENTIVE = 'preventive';

    public const TYPES = [
        self::TYPE_CONTAINMENT,
        self::TYPE_CORRECTIVE,
        self::TYPE_PREVENTIVE,
    ];

    public const STATUS_PENDING = 'pending';
    public const STATUS_IN_PROGRESS = 'in_progress';
    public const STATUS_DONE = 'done';
    public const STATUS_BLOCKED = 'blocked';

    public const STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_IN_PROGRESS,
        self::STATUS_DONE,
        self::STATUS_BLOCKED,
    ];

    protected $fillable = [
        'capa_id',
        'action_type',
        'description',
        'assigned_to',
        'due_date',
        'status',
        'completed_at',
        'completed_by',
        'created_by',
    ];

    protected $casts = [
        'due_date' => 'date',
        'completed_at' => 'datetime',
    ];

    public function capa(): BelongsTo
    {
        return $this->belongsTo(Capa::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'assigned_to');
    }

    public function completer(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'completed_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'created_by');
    }
}
