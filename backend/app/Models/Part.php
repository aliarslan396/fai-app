<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Part master — lives in tenant DB.
 * Stub for Phase 2a customer linkage. Full module in next sprint.
 */
class Part extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'part_number',
        'revision',
        'description',
        'part_type',
        'customer_id',
        'material',
        'material_spec',
        'process',
        'weight',
        'weight_unit',
        'uom',
        'classification',
        'status',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'weight' => 'decimal:4',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function creator()
    {
        return $this->belongsTo(TenantUser::class, 'created_by');
    }

    public function drawings()
    {
        return $this->hasMany(Drawing::class);
    }

    public function inspectionPlans()
    {
        return $this->hasMany(InspectionPlan::class);
    }
}
