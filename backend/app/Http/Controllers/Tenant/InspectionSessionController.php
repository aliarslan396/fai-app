<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\InspectionPlan;
use App\Models\InspectionSession;
use App\Models\Part;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Module 4.3 — 6-Step Workflow Orchestration.
 *
 * Lifecycle:
 *   POST /workflow/sessions          — Step 1+2 create (part + plan picked)
 *   GET  /workflow/sessions/{id}     — load session + auto-filled header
 *   POST /workflow/sessions/{id}/step3 — Step 3 commit (session_type + manual fields stub)
 *
 * Subsequent Step 4-6 commits land when Modules 4.4 / 4.6 are built.
 */
class InspectionSessionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('inspections.view');

        $query = InspectionSession::query()
            ->with(['part:id,part_number,revision,description', 'plan:id,plan_number,plan_name', 'creator:id,name'])
            ->orderByDesc('updated_at');

        // Inspectors see their own only — admins/qa_manager see all
        $user = $request->user();
        if (! $user->hasAnyRole(['admin', 'qa_manager'])) {
            $query->where('created_by', $user->id);
        }

        if ($status = $request->input('status')) {
            // "active" = step6 not yet complete; "complete" = all 6 done
            if ($status === 'active') {
                $query->where('step6_complete', false);
            } elseif ($status === 'complete') {
                $query->where('step6_complete', true);
            }
        }

        $sessions = $query->paginate($request->input('per_page', 25));

        return response()->json([
            'data' => $sessions->items(),
            'total' => $sessions->total(),
            'per_page' => $sessions->perPage(),
            'current_page' => $sessions->currentPage(),
            'last_page' => $sessions->lastPage(),
        ]);
    }

    public function show(int $id, Request $request): JsonResponse
    {
        $this->checkPermission('inspections.view');

        $session = InspectionSession::with([
            'part' => fn ($q) => $q->with('customer:id,name,code'),
            'plan',
            'creator:id,name,email',
        ])->findOrFail($id);

        // Inspector access guard — own sessions only unless admin/manager
        $user = $request->user();
        if (! $user->hasAnyRole(['admin', 'qa_manager']) && $session->created_by !== $user->id) {
            abort(403, 'You do not have access to this session.');
        }

        return response()->json([
            'session' => $session,
            'auto_filled' => $this->autoFillHeader($session),
        ]);
    }

    /**
     * Step 1+2: Inspector picked a Part + Inspection Plan.
     * Creates the session, marks step 1 + 2 complete, current_step = 3.
     */
    public function store(Request $request): JsonResponse
    {
        $this->checkPermission('inspections.create');

        $data = $request->validate([
            'part_id' => 'required|integer|exists:parts,id',
            'inspection_plan_id' => 'required|integer|exists:inspection_plans,id',
        ]);

        // Verify plan belongs to part (no cross-part hijack)
        $plan = InspectionPlan::findOrFail($data['inspection_plan_id']);
        if ($plan->part_id !== (int) $data['part_id']) {
            abort(422, 'Plan does not belong to the selected part.');
        }

        $part = Part::findOrFail($data['part_id']);
        if ($part->status !== 'active') {
            abort(422, 'Cannot inspect parts that are not Active.');
        }

        $session = InspectionSession::create([
            'session_type' => 'as9102', // default, can switch at Step 3
            'part_id' => $part->id,
            'inspection_plan_id' => $plan->id,
            'current_step' => 3,
            'step1_complete' => true,
            'step2_complete' => true,
            'created_by' => $request->user()->id,
        ]);

        AuditLog::record('inspection.session.started', [
            'subject_type' => InspectionSession::class,
            'subject_id' => $session->id,
            'meta' => [
                'part_id' => $part->id,
                'plan_id' => $plan->id,
                'plan_number' => $plan->plan_number,
            ],
        ]);

        return response()->json([
            'session' => $session->load('part:id,part_number,revision,description', 'plan:id,plan_number,plan_name'),
            'auto_filled' => $this->autoFillHeader($session->fresh()),
        ], 201);
    }

    /**
     * Step 3 commit — session_type chosen + manual fields submitted.
     * Persists the choice; FAI / custom record creation lands in Modules 4.4 / 4.5.
     */
    public function step3(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('inspections.create');

        $session = InspectionSession::findOrFail($id);

        if (! $session->step2_complete) {
            abort(422, 'Steps 1+2 must be complete first.');
        }

        $data = $request->validate([
            'session_type' => 'required|in:as9102,custom',
        ]);

        $session->session_type = $data['session_type'];
        $session->markStepComplete(3);

        AuditLog::record('inspection.session.step3', [
            'subject_type' => InspectionSession::class,
            'subject_id' => $session->id,
            'meta' => ['session_type' => $data['session_type']],
        ]);

        return response()->json(['session' => $session->fresh(['part', 'plan'])]);
    }

    public function destroy(int $id, Request $request): JsonResponse
    {
        $this->checkPermission('inspections.delete');

        $session = InspectionSession::findOrFail($id);

        // Don't allow deletion of signed/exported sessions
        if ($session->step5_complete) {
            abort(409, 'Cannot delete a signed inspection session.');
        }

        $session->delete();

        AuditLog::record('inspection.session.deleted', [
            'subject_type' => InspectionSession::class,
            'subject_id' => $id,
        ]);

        return response()->json(['message' => 'Session deleted']);
    }

    /**
     * Auto-fill helper per doc Module 4.3.
     * Returns the read-only header fields that the wizard pre-populates.
     */
    private function autoFillHeader(InspectionSession $session): array
    {
        $session->loadMissing(['part.customer', 'plan']);
        $user = request()->user();

        return [
            'part_number' => $session->part?->part_number,
            'part_name' => $session->part?->description,
            'revision' => $session->part?->revision,
            'customer' => $session->part?->customer?->name,
            'drawing_number' => $session->plan?->plan_number,
            'inspector_name' => $user?->name,
            'inspector_email' => $user?->email,
            'date' => now()->toDateString(),
        ];
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
