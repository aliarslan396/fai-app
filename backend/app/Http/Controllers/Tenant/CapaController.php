<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Capa;
use App\Models\CapaAction;
use App\Services\CapaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use InvalidArgumentException;
use RuntimeException;

/**
 * REST API for CAPA workflow (doc 3.10 / prompt 4.7).
 *
 * All mutations delegate to CapaService. Controller only validates
 * input shape and translates service exceptions into HTTP responses.
 */
class CapaController extends Controller
{
    public function __construct(private CapaService $service) {}

    // ---------------------------------------------------------------- list + show

    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('ncr.view');

        $query = Capa::query()
            ->with([
                'sourceNcr:id,ncr_number,status',
                'part:id,part_number,description',
                'creator:id,name',
                'closer:id,name',
            ])
            ->orderByDesc('created_at');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($sourceNcr = $request->query('source_ncr_id')) {
            $query->where('source_ncr_id', $sourceNcr);
        }
        if ($defectCode = $request->query('defect_code')) {
            $query->where('defect_code', $defectCode);
        }

        return response()->json(['capas' => $query->paginate(50)]);
    }

    public function show(int $id): JsonResponse
    {
        $this->checkPermission('ncr.view');

        $capa = Capa::with([
            'sourceNcr:id,ncr_number,status,defect_code,severity',
            'part:id,part_number,description',
            'creator:id,name,email',
            'closer:id,name',
            'fiveWhys.creator:id,name',
            'actions.assignee:id,name',
            'actions.completer:id,name',
            'actions.creator:id,name',
        ])->findOrFail($id);

        return response()->json([
            'capa' => $capa,
            'meta' => [
                'required_approver_roles' => CapaService::REQUIRED_APPROVER_ROLES,
                'action_types' => CapaAction::TYPES,
                'action_statuses' => CapaAction::STATUSES,
            ],
        ]);
    }

    // ------------------------------------------------------------- Tab 1: Problem

    public function refineProblem(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.edit');
        $capa = Capa::findOrFail($id);

        $data = $request->validate([
            'problem_statement' => 'required|string|max:5000',
            'containment_action' => 'required|string|max:2000',
        ]);

        return $this->guarded(fn () => response()->json([
            'capa' => $this->service->refineProblem($request->user(), $capa, $data),
        ]));
    }

    // ------------------------------------------------------------- Tab 2: 5-Why

    public function saveFiveWhy(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.edit');
        $capa = Capa::findOrFail($id);

        $data = $request->validate([
            'level' => 'required|integer|min:1|max:5',
            'why_text' => 'required|string|max:1000',
        ]);

        return $this->guarded(fn () => response()->json([
            'five_why' => $this->service->saveFiveWhy($request->user(), $capa, (int) $data['level'], $data['why_text']),
        ]));
    }

    public function completeRootCause(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.edit');
        $capa = Capa::findOrFail($id);

        $data = $request->validate([
            'root_cause_summary' => 'required|string|max:2000',
        ]);

        return $this->guarded(fn () => response()->json([
            'capa' => $this->service->completeRootCause($request->user(), $capa, $data['root_cause_summary']),
        ]));
    }

    // ------------------------------------------------------------- Tab 3: Actions

    public function addAction(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.edit');
        $capa = Capa::findOrFail($id);

        $data = $request->validate([
            'action_type' => 'required|string|in:containment,corrective,preventive',
            'description' => 'required|string|max:2000',
            'assigned_to' => 'nullable|integer|exists:users,id',
            'due_date' => 'nullable|date',
        ]);

        return $this->guarded(fn () => response()->json([
            'action' => $this->service->addAction($request->user(), $capa, $data),
        ], 201));
    }

    public function updateAction(Request $request, int $id, int $actionId): JsonResponse
    {
        $this->checkPermission('ncr.edit');
        $action = CapaAction::where('capa_id', $id)->findOrFail($actionId);

        $data = $request->validate([
            'action_type' => 'sometimes|string|in:containment,corrective,preventive',
            'description' => 'sometimes|string|max:2000',
            'assigned_to' => 'sometimes|nullable|integer|exists:users,id',
            'due_date' => 'sometimes|nullable|date',
            'status' => 'sometimes|string|in:pending,in_progress,done,blocked',
        ]);

        return $this->guarded(fn () => response()->json([
            'action' => $this->service->updateAction($request->user(), $action, $data),
        ]));
    }

    public function deleteAction(Request $request, int $id, int $actionId): Response
    {
        $this->checkPermission('ncr.edit');
        $action = CapaAction::where('capa_id', $id)->findOrFail($actionId);

        return $this->guarded(function () use ($request, $action) {
            $this->service->deleteAction($request->user(), $action);
            return response()->noContent();
        });
    }

    // ------------------------------------------------------------- Tab 4: Approval

    public function approve(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.edit');
        $capa = Capa::findOrFail($id);

        $data = $request->validate([
            'note' => 'nullable|string|max:1000',
        ]);

        return $this->guarded(fn () => response()->json([
            'capa' => $this->service->approve($request->user(), $capa, $data['note'] ?? null),
        ]));
    }

    // ------------------------------------------------------------- Tab 5: Effectiveness

    public function scheduleEffectiveness(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.edit');
        $capa = Capa::findOrFail($id);

        $data = $request->validate([
            'review_date' => 'required|date|after:today',
        ]);

        return $this->guarded(fn () => response()->json([
            'capa' => $this->service->scheduleEffectiveness($request->user(), $capa, $data['review_date']),
        ]));
    }

    public function close(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.edit');
        $capa = Capa::findOrFail($id);

        $data = $request->validate([
            'result' => 'required|string|in:effective,ineffective,partial',
            'notes' => 'nullable|string|max:2000',
        ]);

        return $this->guarded(fn () => response()->json([
            'capa' => $this->service->close($request->user(), $capa, $data['result'], $data['notes'] ?? null),
        ]));
    }

    // ---------------------------------------------------------------- helpers

    /**
     * Runs a service call, translating RuntimeException (state-machine
     * violation) to 422 and InvalidArgumentException to 400.
     */
    private function guarded(\Closure $fn)
    {
        try {
            return $fn();
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 400);
        }
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
