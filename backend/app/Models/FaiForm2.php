<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FaiForm2 extends Model
{
    use HasFactory;

    protected $table = 'fai_form2';

    protected $fillable = [
        'fai_form1_id',
        'field1_part_number',
        'field2_part_name',
        'field3_serial_number',
        'field4_fair_identifier',
        'field11_functional_test_procedure',
        'field12_acceptance_report_number',
        'field13_comments',
    ];

    public function form1()
    {
        return $this->belongsTo(FaiForm1::class);
    }

    public function materials()
    {
        return $this->hasMany(FaiForm2Material::class)->orderBy('sort_order');
    }
}
