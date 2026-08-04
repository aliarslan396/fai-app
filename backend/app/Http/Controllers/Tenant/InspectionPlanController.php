<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\InspectionPlan;
use App\Services\ReportNumberService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InspectionPlanController extends Controller
{
    public function __construct(private ReportNumberService $numbers) {}

    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('plans.view');

        $query = InspectionPlan::query()
            ->with(['part:id,part_number,revision,description', 'creator:id,name,email'])
            ->withCount(['documents', 'balloons', 'characteristics']);

        if ($partId = $request->input('part_id')) {
            $query->where('part_id', $partId);
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $plans = $query->orderByDesc('created_at')
            ->paginate($request->input('per_page', 25));

        return response()->json([
            'data' => $plans->items(),
            'total' => $plans->total(),
            'per_page' => $plans->perPage(),
            'current_page' => $plans->currentPage(),
            'last_page' => $plans->lastPage(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $this->checkPermission('plans.view');

        $plan = InspectionPlan::with([
            'part:id,part_number,revision,description,customer_id',
            'part.customer:id,name,code',
            'documents' => function ($q) {
                $q->with('pages:id,drawing_id,page_number,width,height,thumbnail_path,ocr_completed_at');
            },
            'creator:id,name,email',
        ])->findOrFail($id);

        return response()->json(['plan' => $plan]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->checkPermission('plans.create');

        $data = $request->validate([
            'part_id' => 'required|integer|exists:parts,id',
            'plan_name' => 'required|string|min:2|max:200',
            'status' => 'sometimes|in:draft,active,superseded',
            'tol_1dp' => 'sometimes|numeric|min:0|max:10',
            'tol_2dp' => 'sometimes|numeric|min:0|max:10',
            'tol_3dp' => 'sometimes|numeric|min:0|max:10',
            'tol_angular' => 'sometimes|numeric|min:0|max:90',
        ]);

        $data['plan_number'] = $this->numbers->next('IP');
        $data['status'] ??= 'draft';
        $data['created_by'] = $request->user()->id;

        $plan = InspectionPlan::create($data);

        AuditLog::record('plan.created', [
            'subject_type' => InspectionPlan::class,
            'subject_id' => $plan->id,
            'new_values' => $plan->only(['plan_number', 'plan_name', 'part_id', 'status']),
        ]);

        return response()->json([
            'plan' => $plan->load('part:id,part_number,revision,description'),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('plans.edit');

        $plan = InspectionPlan::findOrFail($id);

        $data = $request->validate([
            'plan_name' => 'sometimes|string|min:2|max:200',
            'status' => 'sometimes|in:draft,active,superseded',
            'tol_1dp' => 'sometimes|numeric|min:0|max:10',
            'tol_2dp' => 'sometimes|numeric|min:0|max:10',
            'tol_3dp' => 'sometimes|numeric|min:0|max:10',
            'tol_angular' => 'sometimes|numeric|min:0|max:90',
        ]);

        $oldValues = $plan->only(array_keys($data));
        $plan->update($data);

        AuditLog::record('plan.updated', [
            'subject_type' => InspectionPlan::class,
            'subject_id' => $plan->id,
            'old_values' => $oldValues,
            'new_values' => $plan->only(array_keys($data)),
        ]);

        return response()->json(['plan' => $plan]);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->checkPermission('plans.delete');

        $plan = InspectionPlan::findOrFail($id);
        $snapshot = $plan->only(['plan_number', 'plan_name', 'part_id']);
        $plan->delete();

        AuditLog::record('plan.deleted', [
            'subject_type' => InspectionPlan::class,
            'subject_id' => $id,
            'old_values' => $snapshot,
        ]);

        return response()->json(['message' => 'Plan deleted']);
    }

    /**
     * Publish a plan: draft → active. Only Active plans are selectable when
     * inspectors start a new inspection (doc 3.1 rule enforcement).
     *
     * Requires the plan to have at least one balloon so we don't publish
     * empty templates that would produce empty inspection forms.
     */
    public function publish(int $id): JsonResponse
    {
        $this->checkPermission('plans.edit');

        $plan = InspectionPlan::withCount('balloons')->findOrFail($id);

        if ($plan->status === 'active') {
            return response()->json(['message' => 'Plan is already active.'], 422);
        }
        if ($plan->status === 'superseded') {
            return response()->json(['message' => 'Cannot publish a superseded plan — create a new revision instead.'], 422);
        }
        if ($plan->balloons_count === 0) {
            return response()->json(['message' => 'Cannot publish a plan with zero balloons. Place at least one balloon first.'], 422);
        }

        $oldStatus = $plan->status;
        $plan->update(['status' => 'active']);

        AuditLog::record('plan.published', [
            'subject_type' => InspectionPlan::class,
            'subject_id' => $plan->id,
            'meta' => [
                'plan_number' => $plan->plan_number,
                'from' => $oldStatus,
                'balloons_count' => $plan->balloons_count,
                'user_id' => request()->user()->id,
            ],
        ]);

        return response()->json(['plan' => $plan->fresh()]);
    }

    /**
     * Retire a plan: active → superseded. Keeps historical inspections
     * working (they still reference the plan for audit trail) but hides
     * it from the new-inspection picker.
     */
    public function retire(int $id): JsonResponse
    {
        $this->checkPermission('plans.edit');

        $plan = InspectionPlan::findOrFail($id);

        if ($plan->status !== 'active') {
            return response()->json(['message' => "Cannot retire a plan in status: {$plan->status}"], 422);
        }

        $plan->update(['status' => 'superseded']);

        AuditLog::record('plan.retired', [
            'subject_type' => InspectionPlan::class,
            'subject_id' => $plan->id,
            'meta' => [
                'plan_number' => $plan->plan_number,
                'user_id' => request()->user()->id,
            ],
        ]);

        return response()->json(['plan' => $plan->fresh()]);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
