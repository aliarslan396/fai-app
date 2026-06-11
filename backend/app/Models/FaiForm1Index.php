<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FaiForm1Index extends Model
{
    use HasFactory;

    protected $table = 'fai_form1_index';

    protected $fillable = [
        'fai_form1_id',
        'field15_part_number',
        'field16_part_name',
        'field17_part_type',
        'field18_fair_identifier',
        'sort_order',
    ];

    public function form1()
    {
        return $this->belongsTo(FaiForm1::class);
    }
}
