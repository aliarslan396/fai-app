<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Drawing extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'part_id',
        'plan_id',
        'original_filename',
        'document_label',
        'sort_order',
        'file_path',
        'mime_type',
        'file_size',
        'drawing_number',
        'revision',
        'page_count',
        'status',
        'processing_error',
        'processed_at',
        'uploaded_by',
    ];

    protected $casts = [
        'page_count' => 'integer',
        'file_size' => 'integer',
        'processed_at' => 'datetime',
    ];

    protected $appends = ['pages_rendered'];

    /**
     * Live count of DrawingPage rows so the UI can show progress
     * while a large PDF is still rendering (page_count only gets
     * set to the final total after processing finishes).
     */
    public function getPagesRenderedAttribute(): int
    {
        if (array_key_exists('pages_count', $this->attributes)) {
            return (int) $this->attributes['pages_count'];
        }
        return $this->pages()->count();
    }

    public function part()
    {
        return $this->belongsTo(Part::class);
    }

    public function plan()
    {
        return $this->belongsTo(InspectionPlan::class, 'plan_id');
    }

    public function pages()
    {
        return $this->hasMany(DrawingPage::class)->orderBy('page_number');
    }

    public function balloons()
    {
        return $this->hasMany(DrawingBalloon::class, 'fai_document_id');
    }

    public function uploader()
    {
        return $this->belongsTo(TenantUser::class, 'uploaded_by');
    }
}
