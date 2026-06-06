<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Drawing;
use App\Models\DrawingBalloon;
use App\Models\FaiCharacteristic;
use App\Models\InspectionPlan;
use App\Services\RequirementFormatter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BalloonController extends Controller
{
    public function __construct(private RequirementFormatter $formatter) {}

    public function index(Request $request, int $planId): JsonResponse
    {
        $this->checkPermission('plans.view');

        $plan = InspectionPlan::findOrFail($planId);

        $query = $plan->balloons()->with('characteristic');

        if ($docId = $request->input('fai_document_id')) {
            $query->where('fai_document_id', $docId);
        }
        if ($page = $request->input('page_number')) {
            $query->where('page_number', $page);
        }

        return response()->json(['balloons' => $query->get()]);
    }

    public function store(Request $request, int $planId): JsonResponse
    {
        $this->checkPermission('plans.edit');

        $plan = InspectionPlan::findOrFail($planId);

        $data = $request->validate([
            'fai_document_id' => 'required|integer|exists:drawings,id',
            'page_number' => 'required|integer|min:1',
            'x_pct' => 'required|numeric|min:0|max:100',
            'y_pct' => 'required|numeric|min:0|max:100',
            'char_type' => 'required|in:linear,diameter,radius,angle,gdt,surface_finish,note',
            'source' => 'sometimes|in:manual,ocr',
        ]);

        // Verify the document belongs to this plan
        $doc = Drawing::where('id', $data['fai_document_id'])
            ->where('plan_id', $plan->id)
            ->firstOrFail();

        $balloon = DB::transaction(function () use ($plan, $data, $request) {
            // Assign next continuous balloon number for the plan
            $nextNumber = ($plan->balloons()->max('balloon_number') ?? 0) + 1;

            return DrawingBalloon::create([
                'plan_id' => $plan->id,
                'fai_document_id' => $data['fai_document_id'],
                'balloon_number' => $nextNumber,
                'page_number' => $data['page_number'],
                'x_pct' => $data['x_pct'],
                'y_pct' => $data['y_pct'],
                'char_type' => $data['char_type'],
                'source' => $data['source'] ?? 'manual',
                'created_by' => $request->user()->id,
            ]);
        });

        $plan->recountStats();

        AuditLog::record('balloon.placed', [
            'subject_type' => DrawingBalloon::class,
            'subject_id' => $balloon->id,
            'meta' => [
                'plan_id' => $plan->id,
                'balloon_number' => $balloon->balloon_number,
                'source' => $balloon->source,
            ],
        ]);

        return response()->json(['balloon' => $balloon], 201);
    }

    public function update(Request $request, int $planId, int $balloonId): JsonResponse
    {
        $this->checkPermission('plans.edit');

        $balloon = DrawingBalloon::where('plan_id', $planId)
            ->where('id', $balloonId)
            ->firstOrFail();

        $data = $request->validate([
            'x_pct' => 'sometimes|numeric|min:0|max:100',
            'y_pct' => 'sometimes|numeric|min:0|max:100',
            'page_number' => 'sometimes|integer|min:1',
            'char_type' => 'sometimes|in:linear,diameter,radius,angle,gdt,surface_finish,note',
        ]);

        $balloon->update($data);

        return response()->json(['balloon' => $balloon]);
    }

    public function destroy(int $planId, int $balloonId): JsonResponse
    {
        $this->checkPermission('plans.edit');

        $plan = InspectionPlan::findOrFail($planId);
        $balloon = $plan->balloons()->where('id', $balloonId)->firstOrFail();

        DB::transaction(function () use ($plan, $balloon) {
            $deletedNumber = $balloon->balloon_number;

            // Delete linked characteristic
            if ($balloon->characteristic_id) {
                FaiCharacteristic::where('id', $balloon->characteristic_id)->delete();
            }
            $balloon->delete();

            // Renumber remaining higher-numbered balloons + characteristics
            $plan->balloons()
                ->where('balloon_number', '>', $deletedNumber)
                ->orderBy('balloon_number')
                ->get()
                ->each(function ($b) {
                    $b->balloon_number = $b->balloon_number - 1;
                    $b->save();
                });

            $plan->characteristics()
                ->where('balloon_number', '>', $deletedNumber)
                ->orderBy('balloon_number')
                ->get()
                ->each(function ($c) {
                    $c->balloon_number = $c->balloon_number - 1;
                    $c->save();
                });
        });

        $plan->recountStats();

        return response()->json(['message' => 'Balloon deleted, remaining renumbered']);
    }

    /**
     * Bulk Renumber All — reorder by document sort_order → page → y_pct → x_pct
     * per doc test 5.2 #11.
     */
    public function renumberAll(int $planId): JsonResponse
    {
        $this->checkPermission('plans.edit');

        $plan = InspectionPlan::findOrFail($planId);

        DB::transaction(function () use ($plan) {
            $balloons = $plan->balloons()
                ->join('drawings', 'drawing_balloons.fai_document_id', '=', 'drawings.id')
                ->orderBy('drawings.sort_order')
                ->orderBy('drawings.id')
                ->orderBy('drawing_balloons.page_number')
                ->orderBy('drawing_balloons.y_pct')
                ->orderBy('drawing_balloons.x_pct')
                ->select('drawing_balloons.*')
                ->get();

            $charsByOld = $plan->characteristics()
                ->get()
                ->keyBy('balloon_number');

            $newNumber = 1;
            foreach ($balloons as $balloon) {
                $oldNumber = $balloon->balloon_number;
                $balloon->balloon_number = $newNumber;
                $balloon->save();

                if (isset($charsByOld[$oldNumber])) {
                    $char = $charsByOld[$oldNumber];
                    $char->balloon_number = $newNumber;
                    $char->sort_order = $newNumber;
                    $char->save();
                }

                $newNumber++;
            }
        });

        return response()->json(['message' => 'Renumbered']);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
