<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class CustomInspectionReport extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'ir_number',
        'inspection_session_id',
        'part_id',
        'inspection_plan_id',
        'template_id',
        'fai_form1_id',
        'part_number',
        'part_name',
        'revision',
        'quantity',
        'report_title',
        'serial_lot_number',
        'work_order',
        'inspection_type',
        'tolerance_block',
        'tolerance_block_overridden',
        'inspector_name',
        'prepared_by_name',
        'prepared_at',
        'status',
        'locked',
        'signature_path',
        'stamp_path',
        'created_by',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'tolerance_block_overridden' => 'boolean',
        'prepared_at' => 'datetime',
        'locked' => 'boolean',
    ];

    public function session()
    {
        return $this->belongsTo(InspectionSession::class, 'inspection_session_id');
    }

    public function part()
    {
        return $this->belongsTo(Part::class);
    }

    public function plan()
    {
        return $this->belongsTo(InspectionPlan::class, 'inspection_plan_id');
    }

    public function template()
    {
        return $this->belongsTo(CustomReportTemplate::class, 'template_id');
    }

    public function form1()
    {
        return $this->belongsTo(FaiForm1::class, 'fai_form1_id');
    }

    public function rows()
    {
        return $this->hasMany(CustomReportCharacteristic::class, 'custom_report_id')
            ->orderBy('row_number');
    }

    public function isLocked(): bool
    {
        return $this->locked || $this->status === 'signed';
    }
}
