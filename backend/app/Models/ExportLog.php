<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Immutable download record — one row per Excel/PDF export served to
 * the browser. Doc §5.6.12 audit-trail requirement + AS9100 §8.5
 * traceability evidence.
 *
 * No update/delete paths — history stays intact for the auditor.
 */
class ExportLog extends Model
{
    use HasFactory;

    public const FORMAT_EXCEL = 'excel';
    public const FORMAT_PDF = 'pdf';

    protected $fillable = [
        'subject_type',
        'subject_id',
        'format',
        'file_name',
        'file_size_bytes',
        'exported_by',
        'exported_by_name',
        'ip_address',
        'user_agent',
        'exported_at',
    ];

    protected $casts = [
        'exported_at' => 'datetime',
        'file_size_bytes' => 'integer',
    ];

    public function exporter(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'exported_by');
    }
}
