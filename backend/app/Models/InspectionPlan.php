<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class InspectionPlan extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'plan_number',
        'part_id',
        'plan_name',
        'status',
        'balloon_count',
        'characteristic_count',
        'created_by',
    ];

    protected $casts = [
        'balloon_count' => 'integer',
        'characteristic_count' => 'integer',
    ];

    public function part()
    {
        return $this->belongsTo(Part::class);
    }

    public function documents()
    {
        return $this->hasMany(Drawing::class, 'plan_id')->orderBy('sort_order');
    }

    public function balloons()
    {
        return $this->hasMany(DrawingBalloon::class, 'plan_id')->orderBy('balloon_number');
    }

    public function characteristics()
    {
        return $this->hasMany(FaiCharacteristic::class, 'plan_id')->orderBy('sort_order');
    }

    public function creator()
    {
        return $this->belongsTo(TenantUser::class, 'created_by');
    }

    public function recountStats(): void
    {
        $this->update([
            'balloon_count' => $this->balloons()->count(),
            'characteristic_count' => $this->characteristics()->count(),
        ]);
    }
}
