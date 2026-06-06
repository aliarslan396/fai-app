<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DrawingBalloon extends Model
{
    use HasFactory;

    protected $fillable = [
        'plan_id',
        'fai_document_id',
        'balloon_number',
        'page_number',
        'x_pct',
        'y_pct',
        'char_type',
        'source',
        'characteristic_id',
        'created_by',
    ];

    protected $casts = [
        'balloon_number' => 'integer',
        'page_number' => 'integer',
        'x_pct' => 'decimal:4',
        'y_pct' => 'decimal:4',
    ];

    public function plan()
    {
        return $this->belongsTo(InspectionPlan::class, 'plan_id');
    }

    public function document()
    {
        return $this->belongsTo(Drawing::class, 'fai_document_id');
    }

    public function characteristic()
    {
        return $this->belongsTo(FaiCharacteristic::class, 'characteristic_id');
    }

    public function creator()
    {
        return $this->belongsTo(TenantUser::class, 'created_by');
    }
}
