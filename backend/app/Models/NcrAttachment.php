<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One file attached to an NCR — photo, cal cert, scrap tag, etc.
 *
 * Files live under storage/app/ncr_attachments/tenant_{id}/ncr_{ncr_id}/{uuid.ext}.
 * The stored filename is a UUID (never the user-supplied name) so users
 * can't guess neighboring files by URL and there's zero collision risk.
 * The original filename is preserved on the row for display.
 */
class NcrAttachment extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'ncr_attachments';

    protected $fillable = [
        'ncr_id',
        'original_filename',
        'mime_type',
        'size_bytes',
        'storage_path',
        'uploaded_by',
    ];

    protected $casts = [
        'size_bytes' => 'integer',
    ];

    protected $appends = ['is_image', 'is_pdf', 'human_size'];

    public function ncr(): BelongsTo
    {
        return $this->belongsTo(Ncr::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'uploaded_by');
    }

    public function getIsImageAttribute(): bool
    {
        return str_starts_with($this->mime_type, 'image/');
    }

    public function getIsPdfAttribute(): bool
    {
        return $this->mime_type === 'application/pdf';
    }

    public function getHumanSizeAttribute(): string
    {
        $bytes = (int) $this->size_bytes;
        if ($bytes < 1024) return "{$bytes} B";
        if ($bytes < 1024 * 1024) return round($bytes / 1024, 1) . ' KB';
        return round($bytes / (1024 * 1024), 2) . ' MB';
    }
}
