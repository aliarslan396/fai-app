<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\FaiCharacteristic;
use App\Models\FaiForm1;
use App\Models\FaiForm3Row;
use App\Services\PassFailEvaluator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FaiForm3Controller extends Controller
{
    public function __construct(private PassFailEvaluator $eval) {}

    public function index(int $form1Id): JsonResponse
    {
        $this->checkPermission('inspections.view');

        $form1 = FaiForm1::findOrFail($form1Id);

        $rows = FaiForm3Row::with('characteristic')
            ->where('fai_form1_id', $form1->id)
            ->orderBy('sort_order')
            ->get();

        $total = $rows->count();
        $passed = $rows->where('pass_fail', 'pass')->count();
        $failed = $rows->where('pass_fail', 'fail')->count();
        $notMeasured = $rows->where('pass_fail', 'not_measured')->count();
        $complete = $total - $notMeasured;

        return response()->json([
            'form1' => [
                'id' => $form1->id,
                'fai_number' => $form1->fai_number,
                'status' => $form1->status,
                'returned_reason' => $form1->returned_reason,
                'locked' => $form1->isLocked(),
            ],
            'rows' => $rows,
            'summary' => [
                'total' => $total,
                'passed' => $passed,
                'failed' => $failed,
                'not_measured' => $notMeasured,
                'complete' => $complete,
                'all_done' => $total > 0 && $notMeasured === 0,
            ],
        ]);
    }

    public function updateRow(Request $request, int $form1Id, int $rowId): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $form1 = FaiForm1::findOrFail($form1Id);
        if ($form1->isLocked()) {
            abort(409, 'FAI is locked.');
        }

        $row = FaiForm3Row::with('characteristic')
            ->where('fai_form1_id', $form1->id)
            ->where('id', $rowId)
            ->firstOrFail();

        $data = $request->validate([
            'field6_reference_location' => 'nullable|string|max:100',
            'field7_char_designator' => 'nullable|string|max:50',
            'field9_results' => 'nullable|string|max:1000',
            'field10_qualified_tooling' => 'nullable|string|max:200',
            'field11_nonconformance_number' => 'nullable|string|max:30',
            'field14_additional_comments' => 'nullable|string|max:5000',
            'override_flag' => 'sometimes|boolean',
            'gauge_id' => 'nullable|integer',
        ]);

        $row->fill($data);

        // Recompute pass/fail from the result against the linked characteristic
        if (array_key_exists('field9_results', $data)) {
            $row->pass_fail = $this->eval->evaluate($row->characteristic, $data['field9_results']);
        }

        $row->save();

        return response()->json(['row' => $row->fresh('characteristic')]);
    }

    /**
     * Single-row preview without saving (live re-compute as inspector types).
     */
    public function previewResult(Request $request): JsonResponse
    {
        $this->checkPermission('inspections.view');

        $data = $request->validate([
            'characteristic_id' => 'required|integer',
            'result' => 'nullable|string|max:1000',
        ]);

        $char = FaiCharacteristic::find($data['characteristic_id']);

        return response()->json([
            'pass_fail' => $this->eval->evaluate($char, $data['result'] ?? null),
        ]);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
