<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FaiForm3Row extends Model
{
    use HasFactory;

    protected $table = 'fai_form3_rows';

    protected $fillable = [
        'fai_form1_id',
        'characteristic_id',
        'balloon_number',
        'field5_char_number',
        'field6_reference_location',
        'field7_char_designator',
        'field8_requirement',
        'field9_results',
        'field10_qualified_tooling',
        'field11_nonconformance_number',
        'field14_additional_comments',
        'pass_fail',
        'override_flag',
        'gauge_id',
        'sort_order',
    ];

    protected $casts = [
        'override_flag' => 'boolean',
        'balloon_number' => 'integer',
        'sort_order' => 'integer',
    ];

    public function form1()
    {
        return $this->belongsTo(FaiForm1::class, 'fai_form1_id');
    }

    public function characteristic()
    {
        return $this->belongsTo(FaiCharacteristic::class, 'characteristic_id');
    }
}
