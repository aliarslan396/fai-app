<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CustomReportTemplate extends Model
{
    use HasFactory;

    protected $fillable = [
        'template_code',
        'header_title',
        'doc_number',
        'revision',
        'default_tolerances',
        'max_characteristic_rows',
        'signature_statement',
        'columns_config',
        'primary_color',
        'active',
    ];

    protected $casts = [
        'columns_config' => 'array',
        'max_characteristic_rows' => 'integer',
        'active' => 'boolean',
    ];

    public static function defaultDefQa003(): self
    {
        return self::where('template_code', 'DEF-QA-003')->firstOrFail();
    }
}
