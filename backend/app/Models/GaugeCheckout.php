<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Chain-of-custody log for gauges leaving the tool crib. Open
 * checkouts have checked_in_at NULL; scoped via the `open` builder.
 */
class GaugeCheckout extends Model
{
    use HasFactory;

    protected $fillable = [
        'gauge_id',
        'checked_out_to',
        'job_reference',
        'checked_out_at',
        'checked_in_at',
        'checked_in_by',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'checked_out_at' => 'datetime',
        'checked_in_at' => 'datetime',
    ];

    public function scopeOpen(Builder $q): Builder
    {
        return $q->whereNull('checked_in_at');
    }

    public function gauge(): BelongsTo
    {
        return $this->belongsTo(Gauge::class);
    }

    public function holder(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'checked_out_to');
    }

    public function returner(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'checked_in_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'created_by');
    }
}
