<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Immutable log of one user correction to an AI-detected balloon.
 * Feeds the weekly prompt-tuning CSV export.
 */
class AiCorrection extends Model
{
    use HasFactory;

    public const TYPE_REPOSITION = 'reposition';
    public const TYPE_REJECT = 'reject';
    public const TYPE_RELABEL = 'relabel';

    public const TYPES = [
        self::TYPE_REPOSITION,
        self::TYPE_REJECT,
        self::TYPE_RELABEL,
    ];

    protected $fillable = [
        'plan_id',
        'balloon_id',
        'drawing_id',
        'page_number',
        'correction_type',
        'original_x_pct',
        'original_y_pct',
        'original_char_type',
        'original_ocr_text',
        'corrected_x_pct',
        'corrected_y_pct',
        'corrected_char_type',
        'user_notes',
        'user_id',
    ];

    protected $casts = [
        'original_x_pct' => 'decimal:3',
        'original_y_pct' => 'decimal:3',
        'corrected_x_pct' => 'decimal:3',
        'corrected_y_pct' => 'decimal:3',
    ];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(InspectionPlan::class);
    }

    public function balloon(): BelongsTo
    {
        return $this->belongsTo(DrawingBalloon::class, 'balloon_id');
    }

    public function drawing(): BelongsTo
    {
        return $this->belongsTo(Drawing::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'user_id');
    }
}
