<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FaiForm1 extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'fai_form1';

    protected $fillable = [
        'fai_number',
        'inspection_session_id',
        'part_id',
        'inspection_plan_id',
        'field1_part_number',
        'field2_part_name',
        'field3_serial_number',
        'field4_fair_identifier',
        'field5_part_revision',
        'field6_drawing_number',
        'field7_drawing_revision',
        'field8_additional_changes',
        'field9_mfg_process_ref',
        'field10_org_name',
        'field11_supplier_code',
        'field12_po_number',
        'field13_detail_or_assembly',
        'field14_fai_type',
        'field14_baseline_part_number',
        'field14_partial_reason',
        'field19_has_nonconformance',
        'field20_verified_by_name',
        'field21_verified_at',
        'field22_reviewed_by_name',
        'field23_reviewed_at',
        'field24_customer_approval_name',
        'field25_customer_approval_at',
        'field26_comments',
        'status',
        'returned_reason',
        'locked',
        'signature_path',
        'stamp_path',
        'locked_at',
        'locked_by',
    ];

    protected $casts = [
        'field19_has_nonconformance' => 'boolean',
        'field21_verified_at' => 'datetime',
        'field23_reviewed_at' => 'datetime',
        'field25_customer_approval_at' => 'datetime',
        'locked' => 'boolean',
        'locked_at' => 'datetime',
        'locked_by' => 'integer',
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

    public function indexRows()
    {
        return $this->hasMany(FaiForm1Index::class)->orderBy('sort_order');
    }

    public function form2()
    {
        return $this->hasOne(FaiForm2::class);
    }

    public function form3Rows()
    {
        return $this->hasMany(FaiForm3Row::class)->orderBy('sort_order');
    }

    public function signatures()
    {
        return $this->morphMany(Signature::class, 'signable');
    }

    public function isLocked(): bool
    {
        return $this->locked
            || $this->status === 'accepted'
            || $this->locked_at !== null;
    }
}
