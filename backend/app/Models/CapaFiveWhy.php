<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per level of the 5-Why chain on a CAPA.
 *
 * Level 1 = the first "why" after the problem statement, Level 5 =
 * the deepest root cause we're required to reach by AS9100 §10.2.
 * Rows written in order via CapaService::saveFiveWhys() — the
 * service enforces the progressive lock (no level N without N-1).
 */
class CapaFiveWhy extends Model
{
    use HasFactory;

    protected $table = 'capa_five_whys';

    protected $fillable = [
        'capa_id',
        'level',
        'why_text',
        'created_by',
    ];

    protected $casts = [
        'level' => 'integer',
    ];

    public function capa(): BelongsTo
    {
        return $this->belongsTo(Capa::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'created_by');
    }
}
