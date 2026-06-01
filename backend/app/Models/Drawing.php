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
        'original_filename',
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

    public function part()
    {
        return $this->belongsTo(Part::class);
    }

    public function pages()
    {
        return $this->hasMany(DrawingPage::class)->orderBy('page_number');
    }

    public function uploader()
    {
        return $this->belongsTo(TenantUser::class, 'uploaded_by');
    }
}
