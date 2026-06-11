<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FaiForm2Material extends Model
{
    use HasFactory;

    protected $table = 'fai_form2_materials';

    protected $fillable = [
        'fai_form2_id',
        'field5_material_name',
        'field6_spec_number',
        'field7_code',
        'field8_supplier',
        'field9_customer_approval',
        'field10_coc_number',
        'sort_order',
    ];

    public function form2()
    {
        return $this->belongsTo(FaiForm2::class);
    }
}
