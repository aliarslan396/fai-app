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
        'tol_1dp',
        'tol_2dp',
        'tol_3dp',
        'tol_angular',
    ];

    protected $casts = [
        'balloon_count' => 'integer',
        'characteristic_count' => 'integer',
        'tol_1dp' => 'decimal:5',
        'tol_2dp' => 'decimal:5',
        'tol_3dp' => 'decimal:5',
        'tol_angular' => 'decimal:5',
    ];

    public function part()
    {
        return $this->belongsTo(Part::class);
    }

    /**
     * Drawings this plan can reference. Every drawing uploaded for the
     * parent part is available in every plan for that part — users
     * shouldn't have to re-upload the same PDF once for the Part page
     * and again inside each plan's workspace. The plan_id column on
     * Drawing is retained for future per-plan scoping but is not
     * required for a document to show up here.
     */
    public function documents()
    {
        return $this->hasMany(Drawing::class, 'part_id', 'part_id')
            ->orderBy('sort_order');
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
