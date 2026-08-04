<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\FaiForm1;
use App\Models\Gauge;
use App\Models\InspectionPlan;
use App\Models\InspectionSession;
use App\Models\Ncr;
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

        // NCR + Gauge modules now live (Week 15). Pull real counts.
        $openNcrs = Ncr::where('status', 'open')->count();
        // Gauges "due" per doc 3.11 = overdue OR within 14 days
        $gaugesDue = Gauge::query()
            ->where('out_of_service', false)
            ->where(function ($q) {
                $q->whereNull('next_cal_due')
                  ->orWhereDate('next_cal_due', '<=', now()->addDays(14));
            })
            ->count();

        // Forms submitted for QA review — count for the "Pending My Review"
        // widget. Only meaningful for users who can accept/return (has
        // inspections.sign perm). For inspectors this stays 0.
        $canReview = $user && $user->hasPermissionTo('inspections.sign');
        $pendingReviews = $canReview
            ? FaiForm1::where('status', 'submitted')->count()
            : 0;

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
                        : ($s->current_step >= 4
                            ? ($s->session_type === 'as9102'
                                ? "/inspections/{$s->id}/form3"
                                : "/inspections/{$s->id}/custom-report")
                            : "/workflow/new-inspection/{$s->id}"),
                    'updated_at' => $s->updated_at,
                ];
            });

        // Pending reviews list for the widget — full FAI rows w/ session +
        // part context so QA Manager can click straight through to Form 3.
        $pendingReviewRows = collect();
        if ($canReview) {
            $pendingReviewRows = FaiForm1::query()
                ->where('status', 'submitted')
                ->with([
                    'part:id,part_number,revision,description',
                    'session:id,session_type,created_by',
                    'session.creator:id,name',
                ])
                ->orderBy('updated_at')
                ->limit(20)
                ->get()
                ->map(function ($f) {
                    return [
                        'id' => $f->id,
                        'fai_number' => $f->fai_number,
                        'part' => $f->part ? [
                            'id' => $f->part->id,
                            'part_number' => $f->part->part_number,
                            'revision' => $f->part->revision,
                        ] : null,
                        'session_id' => $f->inspection_session_id,
                        'submitted_by' => optional($f->session?->creator)->name,
                        'updated_at' => $f->updated_at,
                        'href' => "/inspections/{$f->inspection_session_id}/form3",
                    ];
                });
        }

        return response()->json([
            'kpis' => [
                'active_inspections' => $activeInspections,
                'completed_inspections' => $completedInspections,
                'open_ncrs' => $openNcrs,
                'inspection_plans' => $plansCount,
                'gauges_due' => $gaugesDue,
                'pending_reviews' => $pendingReviews,
            ],
            'recent_inspections' => $recent,
            'pending_actions' => $pending,
            'pending_reviews' => $pendingReviewRows,
            'scope' => $isLeader ? 'org' : 'self',
        ]);
    }
}
