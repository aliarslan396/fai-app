<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DrawingPage extends Model
{
    use HasFactory;

    protected $fillable = [
        'drawing_id',
        'page_number',
        'image_path',
        'thumbnail_path',
        'width',
        'height',
        'ocr_text',
        'ai_analysis',
        'ocr_completed_at',
        'ai_completed_at',
    ];

    protected $casts = [
        'page_number' => 'integer',
        'width' => 'integer',
        'height' => 'integer',
        'ocr_text' => 'array',
        'ai_analysis' => 'array',
        'ocr_completed_at' => 'datetime',
        'ai_completed_at' => 'datetime',
    ];

    public function drawing()
    {
        return $this->belongsTo(Drawing::class);
    }
}
