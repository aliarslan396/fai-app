<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\FaiForm1;
use App\Models\FaiForm1Index;
use App\Models\FaiForm2;
use App\Models\InspectionSession;
use App\Services\Form3SyncEngine;
use App\Services\ReportNumberService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FaiForm1Controller extends Controller
{
    public function __construct(
        private ReportNumberService $numbers,
        private Form3SyncEngine $sync,
    ) {}

    /**
     * Auto-create (or fetch) the Form 1 record for a given inspection session.
     * Hits when inspector lands on Step 4 of the workflow.
     */
    public function ensureForSession(Request $request, int $sessionId): JsonResponse
    {
        $this->checkPermission('inspections.view');

        $session = InspectionSession::with(['part.customer', 'plan'])->findOrFail($sessionId);

        if ($session->session_type !== 'as9102') {
            abort(422, 'This session is not an AS9102 inspection.');
        }

        $form1 = $session->fai_id
            ? FaiForm1::find($session->fai_id)
            : null;

        if (! $form1) {
            $form1 = DB::transaction(function () use ($session) {
                $fai = FaiForm1::create([
                    'fai_number' => $this->numbers->next('FAI'),
                    'inspection_session_id' => $session->id,
                    'part_id' => $session->part_id,
                    'inspection_plan_id' => $session->inspection_plan_id,

                    // Auto-fill fields 1-7 from part + plan
                    'field1_part_number' => $session->part?->part_number,
                    'field2_part_name' => $session->part?->description,
                    'field5_part_revision' => $session->part?->revision,
                    'field6_drawing_number' => $session->plan?->plan_number,
                    'field7_drawing_revision' => $session->plan?->status === 'active' ? '1' : null,
                    'field13_detail_or_assembly' => $session->part?->part_type === 'assembly' ? 'assembly' : 'detail',
                    'field14_fai_type' => 'full',
                    'status' => 'in_work',
                ]);

                $session->fai_id = $fai->id;
                $session->save();

                FaiForm2::create([
                    'fai_form1_id' => $fai->id,
                    'field1_part_number' => $fai->field1_part_number,
                    'field2_part_name' => $fai->field2_part_name,
                ]);

                AuditLog::record('fai.created', [
                    'subject_type' => FaiForm1::class,
                    'subject_id' => $fai->id,
                    'meta' => [
                        'fai_number' => $fai->fai_number,
                        'part_id' => $fai->part_id,
                        'plan_id' => $fai->inspection_plan_id,
                    ],
                ]);

                return $fai;
            });

            // First-time sync of Form 3 rows from the plan
            $this->sync->sync($form1);
        }

        return response()->json([
            'form1' => $form1->load(['indexRows', 'form2.materials']),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $this->checkPermission('inspections.view');

        $form1 = FaiForm1::with([
            'indexRows',
            'form2.materials',
            'part:id,part_number,revision,description,part_type',
            'plan:id,plan_number,plan_name,balloon_count,characteristic_count',
            'session:id,session_type,current_step,step1_complete,step2_complete,step3_complete,step4_complete,step5_complete,step6_complete',
        ])->findOrFail($id);

        return response()->json(['form1' => $form1]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $form1 = FaiForm1::findOrFail($id);
        if ($form1->isLocked()) {
            abort(409, 'This FAI is locked (accepted). Edits disabled.');
        }

        $data = $request->validate([
            'field3_serial_number' => 'nullable|string|max:100',
            'field4_fair_identifier' => 'nullable|string|max:100',
            'field8_additional_changes' => 'nullable|string|max:5000',
            'field9_mfg_process_ref' => 'nullable|string|max:200',
            'field10_org_name' => 'nullable|string|max:200',
            'field11_supplier_code' => 'nullable|string|max:100',
            'field12_po_number' => 'nullable|string|max:100',
            'field13_detail_or_assembly' => 'sometimes|in:detail,assembly',
            'field14_fai_type' => 'sometimes|in:full,partial',
            'field14_baseline_part_number' => 'nullable|string|max:100',
            'field14_partial_reason' => 'nullable|string|max:2000',
            'field19_has_nonconformance' => 'sometimes|boolean',
            'field26_comments' => 'nullable|string|max:5000',
        ]);

        $form1->fill($data)->save();

        return response()->json(['form1' => $form1]);
    }

    public function syncFromBalloons(int $id): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $form1 = FaiForm1::findOrFail($id);
        if ($form1->isLocked()) {
            abort(409, 'FAI is locked.');
        }

        $count = $this->sync->sync($form1);

        return response()->json([
            'message' => "Synced {$count} characteristic rows from plan.",
            'count' => $count,
        ]);
    }

    public function storeIndexRow(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $form1 = FaiForm1::findOrFail($id);
        if ($form1->isLocked()) {
            abort(409, 'FAI is locked.');
        }

        $data = $request->validate([
            'field15_part_number' => 'required|string|max:100',
            'field16_part_name' => 'nullable|string|max:200',
            'field17_part_type' => 'nullable|in:raw,sub,assembly,finish',
            'field18_fair_identifier' => 'nullable|string|max:100',
        ]);

        $sortOrder = (int) FaiForm1Index::where('fai_form1_id', $form1->id)->max('sort_order') + 1;

        $row = FaiForm1Index::create($data + [
            'fai_form1_id' => $form1->id,
            'sort_order' => $sortOrder,
        ]);

        return response()->json(['index_row' => $row], 201);
    }

    public function destroyIndexRow(int $id, int $rowId): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $form1 = FaiForm1::findOrFail($id);
        if ($form1->isLocked()) {
            abort(409, 'FAI is locked.');
        }

        FaiForm1Index::where('fai_form1_id', $form1->id)
            ->where('id', $rowId)
            ->firstOrFail()
            ->delete();

        return response()->json(['message' => 'Index row deleted']);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
