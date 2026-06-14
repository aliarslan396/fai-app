<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CustomReportCharacteristic extends Model
{
    use HasFactory;

    protected $fillable = [
        'custom_report_id',
        'characteristic_id',
        'row_number',
        'balloon_number',
        'field5_char_number',
        'field6_reference_location',
        'field7_char_designator',
        'field8_requirement',
        'field9_results',
        'field10_qa_acceptance',
        'field11_ncr_number',
        'field14_comments',
        'pass_fail',
        'override_flag',
    ];

    protected $casts = [
        'row_number' => 'integer',
        'balloon_number' => 'integer',
        'override_flag' => 'boolean',
    ];

    public function report()
    {
        return $this->belongsTo(CustomInspectionReport::class, 'custom_report_id');
    }

    public function characteristic()
    {
        return $this->belongsTo(FaiCharacteristic::class, 'characteristic_id');
    }
}
