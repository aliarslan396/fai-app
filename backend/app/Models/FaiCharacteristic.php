<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FaiCharacteristic extends Model
{
    use HasFactory;

    protected $fillable = [
        'plan_id',
        'balloon_number',
        'char_type',
        'description',
        'nominal',
        'upper_tolerance',
        'lower_tolerance',
        'unit',
        'gdt_symbol',
        'gdt_datum_a',
        'gdt_datum_b',
        'gdt_datum_c',
        'gdt_material_condition',
        'finish_value',
        'finish_unit',
        'inspection_method',
        'requirement_string',
        'sort_order',
    ];

    protected $casts = [
        'balloon_number' => 'integer',
        'nominal' => 'decimal:6',
        'upper_tolerance' => 'decimal:6',
        'lower_tolerance' => 'decimal:6',
        'sort_order' => 'integer',
    ];

    public function form3Rows()
    {
        return $this->hasMany(FaiForm3Row::class, 'characteristic_id');
    }

    public function plan()
    {
        return $this->belongsTo(InspectionPlan::class, 'plan_id');
    }

    public function balloon()
    {
        return $this->hasOne(DrawingBalloon::class, 'characteristic_id');
    }
}
