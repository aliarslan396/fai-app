<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\FaiForm1;
use App\Models\FaiForm2;
use App\Models\FaiForm2Material;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FaiForm2Controller extends Controller
{
    public function show(int $form1Id): JsonResponse
    {
        $this->checkPermission('inspections.view');

        $form1 = FaiForm1::findOrFail($form1Id);
        $form2 = FaiForm2::with('materials')->where('fai_form1_id', $form1->id)->firstOrFail();

        // Echo back Form 1 fields 1-4 (read-only on Form 2 per doc)
        $form2->field1_part_number = $form1->field1_part_number;
        $form2->field2_part_name = $form1->field2_part_name;
        $form2->field3_serial_number = $form1->field3_serial_number;
        $form2->field4_fair_identifier = $form1->field4_fair_identifier;

        return response()->json(['form2' => $form2]);
    }

    public function update(Request $request, int $form1Id): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $form1 = FaiForm1::findOrFail($form1Id);
        if ($form1->isLocked()) {
            abort(409, 'FAI is locked.');
        }

        $form2 = FaiForm2::where('fai_form1_id', $form1->id)->firstOrFail();

        $data = $request->validate([
            'field11_functional_test_procedure' => 'nullable|string|max:200',
            'field12_acceptance_report_number' => 'nullable|string|max:200',
            'field13_comments' => 'nullable|string|max:5000',
        ]);

        $form2->fill($data)->save();

        return response()->json(['form2' => $form2]);
    }

    public function storeMaterial(Request $request, int $form1Id): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $form1 = FaiForm1::findOrFail($form1Id);
        if ($form1->isLocked()) {
            abort(409, 'FAI is locked.');
        }

        $form2 = FaiForm2::where('fai_form1_id', $form1->id)->firstOrFail();

        $data = $request->validate([
            'field5_material_name' => 'required|string|max:200',
            'field6_spec_number' => 'nullable|string|max:100',
            'field7_code' => 'nullable|string|max:100',
            'field8_supplier' => 'nullable|string|max:200',
            'field9_customer_approval' => 'nullable|in:yes,no,na',
            'field10_coc_number' => 'nullable|string|max:100',
        ]);

        $sortOrder = (int) FaiForm2Material::where('fai_form2_id', $form2->id)->max('sort_order') + 1;

        $row = FaiForm2Material::create($data + [
            'fai_form2_id' => $form2->id,
            'sort_order' => $sortOrder,
        ]);

        return response()->json(['material' => $row], 201);
    }

    public function updateMaterial(Request $request, int $form1Id, int $rowId): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $form1 = FaiForm1::findOrFail($form1Id);
        if ($form1->isLocked()) {
            abort(409, 'FAI is locked.');
        }

        $form2 = FaiForm2::where('fai_form1_id', $form1->id)->firstOrFail();

        $row = FaiForm2Material::where('fai_form2_id', $form2->id)
            ->where('id', $rowId)
            ->firstOrFail();

        $data = $request->validate([
            'field5_material_name' => 'sometimes|string|max:200',
            'field6_spec_number' => 'nullable|string|max:100',
            'field7_code' => 'nullable|string|max:100',
            'field8_supplier' => 'nullable|string|max:200',
            'field9_customer_approval' => 'nullable|in:yes,no,na',
            'field10_coc_number' => 'nullable|string|max:100',
        ]);

        $row->fill($data)->save();

        return response()->json(['material' => $row]);
    }

    public function destroyMaterial(int $form1Id, int $rowId): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $form1 = FaiForm1::findOrFail($form1Id);
        if ($form1->isLocked()) {
            abort(409, 'FAI is locked.');
        }

        $form2 = FaiForm2::where('fai_form1_id', $form1->id)->firstOrFail();

        FaiForm2Material::where('fai_form2_id', $form2->id)
            ->where('id', $rowId)
            ->firstOrFail()
            ->delete();

        return response()->json(['message' => 'Material row deleted']);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
