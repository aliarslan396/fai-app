<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\DrawingBalloon;
use App\Models\FaiCharacteristic;
use App\Models\InspectionPlan;
use App\Services\RequirementFormatter;
use App\Services\ToleranceResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CharacteristicController extends Controller
{
    public function __construct(
        private RequirementFormatter $formatter,
        private ToleranceResolver $resolver,
    ) {}

    /**
     * Save (upsert) a characteristic for a balloon.
     * Returns the saved characteristic + the live requirement_string preview
     * built by the server-side formatter (canonical source of truth).
     */
    public function save(Request $request, int $planId, int $balloonId): JsonResponse
    {
        $this->checkPermission('plans.edit');

        $plan = InspectionPlan::findOrFail($planId);
        $balloon = $plan->balloons()->where('id', $balloonId)->firstOrFail();

        $data = $request->validate([
            'char_type' => 'required|in:linear,diameter,radius,angle,gdt,surface_finish,note',
            'description' => 'nullable|string|max:5000',
            'nominal' => 'nullable|numeric',
            'upper_tolerance' => 'nullable|numeric',
            'lower_tolerance' => 'nullable|numeric',
            'unit' => 'nullable|string|max:20',
            'gdt_symbol' => 'nullable|string|max:10',
            'gdt_datum_a' => 'nullable|string|max:20',
            'gdt_datum_b' => 'nullable|string|max:20',
            'gdt_datum_c' => 'nullable|string|max:20',
            'gdt_material_condition' => 'nullable|in:mmc,lmc,rfs',
            'finish_value' => 'nullable|string|max:50',
            'finish_unit' => 'nullable|string|max:30',
            'inspection_method' => 'nullable|string|max:100',
            'use_default_tolerance' => 'nullable|boolean',
            'nominal_decimals' => 'nullable|integer|min:0|max:6',
        ]);

        // If using plan defaults, overwrite upper/lower from resolver before formatting.
        if (! empty($data['use_default_tolerance'])) {
            [$up, $lo] = $this->resolveFromPlan($plan, $data);
            if ($up !== null) {
                $data['upper_tolerance'] = $up;
                $data['lower_tolerance'] = $lo;
            }
        }

        $requirementString = $this->formatter->format($data + ['char_type' => $data['char_type']]);

        $characteristic = DB::transaction(function () use ($plan, $balloon, $data, $requirementString) {
            $payload = $data + [
                'plan_id' => $plan->id,
                'balloon_number' => $balloon->balloon_number,
                'requirement_string' => $requirementString,
                'sort_order' => $balloon->balloon_number,
            ];

            $char = $balloon->characteristic_id
                ? FaiCharacteristic::find($balloon->characteristic_id)
                : null;

            if ($char) {
                $char->update($payload);
            } else {
                $char = FaiCharacteristic::updateOrCreate(
                    ['plan_id' => $plan->id, 'balloon_number' => $balloon->balloon_number],
                    $payload
                );
                $balloon->characteristic_id = $char->id;
                $balloon->char_type = $data['char_type'];
                $balloon->save();
            }

            return $char;
        });

        $plan->recountStats();

        return response()->json([
            'characteristic' => $characteristic,
            'requirement_string' => $requirementString,
        ]);
    }

    /**
     * Live preview without saving — used by sidebar as inspector types.
     */
    public function preview(Request $request): JsonResponse
    {
        $this->checkPermission('plans.view');

        $data = $request->validate([
            'char_type' => 'required|in:linear,diameter,radius,angle,gdt,surface_finish,note',
            'description' => 'nullable|string|max:5000',
            'nominal' => 'nullable|numeric',
            'upper_tolerance' => 'nullable|numeric',
            'lower_tolerance' => 'nullable|numeric',
            'unit' => 'nullable|string|max:20',
            'gdt_symbol' => 'nullable|string|max:10',
            'gdt_datum_a' => 'nullable|string|max:20',
            'gdt_datum_b' => 'nullable|string|max:20',
            'gdt_datum_c' => 'nullable|string|max:20',
            'gdt_material_condition' => 'nullable|in:mmc,lmc,rfs',
            'finish_value' => 'nullable|string|max:50',
            'finish_unit' => 'nullable|string|max:30',
        ]);

        return response()->json([
            'requirement_string' => $this->formatter->format($data),
        ]);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }

    /**
     * Read tolerance from plan defaults using the supplied char_type +
     * nominal_decimals (or 0 when not provided). Returns [upper, lower] or
     * [null, null] when block tolerance doesn't apply to this type.
     *
     * @return array{0: ?float, 1: ?float}
     */
    private function resolveFromPlan(InspectionPlan $plan, array $data): array
    {
        $excluded = ['gdt', 'surface_finish', 'threaded', 'chamfer', 'note'];
        if (in_array($data['char_type'] ?? '', $excluded, true)) {
            return [null, null];
        }

        if (($data['char_type'] ?? '') === 'angle') {
            $tol = (float) $plan->tol_angular;
            return [$tol, $tol];
        }

        $decimals = (int) ($data['nominal_decimals'] ?? 0);
        $tol = match (true) {
            $decimals >= 3 => (float) $plan->tol_3dp,
            $decimals === 2 => (float) $plan->tol_2dp,
            default => (float) $plan->tol_1dp,
        };

        return [$tol, $tol];
    }
}
