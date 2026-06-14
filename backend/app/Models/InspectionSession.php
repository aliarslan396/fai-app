<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class InspectionSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'session_type',
        'part_id',
        'inspection_plan_id',
        'fai_id',
        'custom_report_id',
        // kept here so $session->custom_report_id mass-assigns from controller
        'current_step',
        'step1_complete',
        'step2_complete',
        'step3_complete',
        'step4_complete',
        'step5_complete',
        'step6_complete',
        'created_by',
    ];

    protected $casts = [
        'current_step' => 'integer',
        'step1_complete' => 'boolean',
        'step2_complete' => 'boolean',
        'step3_complete' => 'boolean',
        'step4_complete' => 'boolean',
        'step5_complete' => 'boolean',
        'step6_complete' => 'boolean',
    ];

    public function part()
    {
        return $this->belongsTo(Part::class);
    }

    public function plan()
    {
        return $this->belongsTo(InspectionPlan::class, 'inspection_plan_id');
    }

    public function creator()
    {
        return $this->belongsTo(TenantUser::class, 'created_by');
    }

    public function isStepComplete(int $step): bool
    {
        return (bool) ($this->{"step{$step}_complete"} ?? false);
    }

    public function markStepComplete(int $step): void
    {
        $field = "step{$step}_complete";
        $this->{$field} = true;
        if ($this->current_step < $step + 1 && $step < 6) {
            $this->current_step = $step + 1;
        }
        $this->save();
    }
}
