<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\InspectionPlan;
use App\Models\InspectionSession;
use App\Models\Part;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Tenant dashboard — KPI counts + recent activity for the landing page.
 * Role-filtered: inspectors see their own work, admin/qa_manager see org-wide.
 */
class DashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $isLeader = $user && $user->hasAnyRole(['admin', 'qa_manager']);

        $sessionQuery = InspectionSession::query();
        if (! $isLeader) {
            $sessionQuery->where('created_by', $user->id);
        }

        $activeInspections = (clone $sessionQuery)->where('step6_complete', false)->count();
        $completedInspections = (clone $sessionQuery)->where('step6_complete', true)->count();

        // NCR / Gauges not built yet (Module 4.7) — return 0 placeholders
        $openNcrs = 0;
        $gaugesDue = 0;

        // Plans count (org-wide for now)
        $plansCount = InspectionPlan::where('status', 'active')->count();

        // Recent inspections (last 10)
        $recent = (clone $sessionQuery)
            ->with([
                'part:id,part_number,revision,description',
                'plan:id,plan_number,plan_name',
                'creator:id,name',
            ])
            ->orderByDesc('updated_at')
            ->limit(10)
            ->get();

        // Pending Actions = sessions in progress assigned to *this* user
        $pending = InspectionSession::query()
            ->where('created_by', $user->id)
            ->where('step6_complete', false)
            ->with(['part:id,part_number,revision', 'plan:id,plan_number'])
            ->orderBy('updated_at')
            ->limit(10)
            ->get()
            ->map(function ($s) {
                return [
                    'id' => $s->id,
                    'kind' => 'inspection',
                    'label' => "Continue inspection — {$s->part?->part_number} Rev {$s->part?->revision}",
                    'detail' => "Step {$s->current_step}/6 — {$s->plan?->plan_number}",
                    'href' => $s->current_step <= 2
                        ? '/workflow/start'
                        : ($s->current_step >= 4 && $s->session_type === 'as9102'
                            ? "/inspections/{$s->id}/form3"
                            : "/workflow/new-inspection/{$s->id}"),
                    'updated_at' => $s->updated_at,
                ];
            });

        return response()->json([
            'kpis' => [
                'active_inspections' => $activeInspections,
                'completed_inspections' => $completedInspections,
                'open_ncrs' => $openNcrs,
                'inspection_plans' => $plansCount,
                'gauges_due' => $gaugesDue,
            ],
            'recent_inspections' => $recent,
            'pending_actions' => $pending,
            'scope' => $isLeader ? 'org' : 'self',
        ]);
    }
}
