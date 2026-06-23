<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Drawing;
use App\Models\DrawingBalloon;
use App\Models\DrawingPage;
use App\Models\FaiCharacteristic;
use App\Models\InspectionPlan;
use App\Services\OcrService;
use App\Services\RequirementFormatter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BalloonController extends Controller
{
    public function __construct(
        private RequirementFormatter $formatter,
        private OcrService $ocr,
    ) {}

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

    /**
     * AI auto-detect candidates for a drawing page.
     * Reads stored OCR text blocks → classifies each via Ollama → returns
     * ranked candidate list WITHOUT creating balloons. Frontend renders
     * the candidates; inspector accepts the ones they want via bulkAccept.
     */
    public function autoDetect(int $planId, int $drawingId, int $pageNumber): JsonResponse
    {
        $this->checkPermission('plans.edit');

        $plan = InspectionPlan::findOrFail($planId);
        $drawing = Drawing::where('id', $drawingId)
            ->where('plan_id', $plan->id)
            ->firstOrFail();

        $page = DrawingPage::where('drawing_id', $drawing->id)
            ->where('page_number', $pageNumber)
            ->firstOrFail();

        if (! $page->ocr_text || empty($page->ocr_text['blocks'] ?? [])) {
            return response()->json([
                'message' => 'No OCR data on this page yet. Run OCR first.',
                'candidates' => [],
            ], 409);
        }

        $blocks = $page->ocr_text['blocks'];

        // Keep only blocks that look dimensional: contain digits OR a GD&T glyph
        $dimensionLike = array_values(array_filter($blocks, function ($b) {
            $text = (string) ($b['text'] ?? '');
            if (preg_match('/\d/', $text)) {
                return true;
            }
            return (bool) preg_match('/[⊕⊥⏥⌭⌒⌓∠∥◎≡↗⇗○⏤Ø∅]/u', $text);
        }));

        if (empty($dimensionLike)) {
            return response()->json(['candidates' => [], 'message' => 'No dimensional text found']);
        }

        $texts = array_map(fn ($b) => $b['text'], $dimensionLike);

        try {
            $classifications = $this->ocr->classifyBatch($texts);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'AI classifier unreachable: '.$e->getMessage()], 503);
        }

        // Stitch each classification back to its bbox + compute x_pct/y_pct
        $width = (int) ($page->ocr_text['width'] ?? $page->width ?? 1);
        $height = (int) ($page->ocr_text['height'] ?? $page->height ?? 1);

        $candidates = [];
        foreach ($dimensionLike as $i => $block) {
            $cls = $classifications[$i] ?? null;
            if (! $cls) {
                continue;
            }
            // Skip pure-note fallbacks with zero confidence
            if (($cls['confidence'] ?? 0) < 0.3) {
                continue;
            }

            [$x, $y, $w, $h] = $block['bbox'];
            $candidates[] = [
                'source_text' => $block['text'],
                'ocr_confidence' => $block['confidence'] ?? null,
                'x_pct' => $width > 0 ? round((($x + $w / 2) / $width) * 100, 4) : 0,
                'y_pct' => $height > 0 ? round((($y + $h / 2) / $height) * 100, 4) : 0,
                'bbox' => $block['bbox'],
                'char_type' => $cls['char_type'] ?? 'note',
                'nominal' => $cls['nominal'] ?? null,
                'upper_tolerance' => $cls['upper_tolerance'] ?? null,
                'lower_tolerance' => $cls['lower_tolerance'] ?? null,
                'unit' => $cls['unit'] ?? null,
                'gdt_symbol' => $cls['gdt_symbol'] ?? null,
                'gdt_datums' => $cls['gdt_datums'] ?? [],
                'finish_value' => $cls['finish_value'] ?? null,
                'finish_unit' => $cls['finish_unit'] ?? null,
                'confidence' => $cls['confidence'] ?? 0,
            ];
        }

        // Sort by confidence desc so inspector sees best matches first
        usort($candidates, fn ($a, $b) => $b['confidence'] <=> $a['confidence']);

        return response()->json([
            'candidates' => $candidates,
            'page_size' => ['width' => $width, 'height' => $height],
        ]);
    }

    /**
     * Bulk-accept selected AI candidates as real balloons + characteristics.
     */
    public function bulkAccept(Request $request, int $planId): JsonResponse
    {
        $this->checkPermission('plans.edit');

        $plan = InspectionPlan::findOrFail($planId);

        $data = $request->validate([
            'fai_document_id' => 'required|integer|exists:drawings,id',
            'page_number' => 'required|integer|min:1',
            'candidates' => 'required|array|min:1',
            'candidates.*.x_pct' => 'required|numeric|min:0|max:100',
            'candidates.*.y_pct' => 'required|numeric|min:0|max:100',
            'candidates.*.char_type' => 'required|in:linear,diameter,radius,angle,gdt,surface_finish,note',
            'candidates.*.source_text' => 'nullable|string|max:500',
            'candidates.*.confidence' => 'nullable|numeric|min:0|max:1',
            'candidates.*.nominal' => 'nullable|numeric',
            'candidates.*.upper_tolerance' => 'nullable|numeric',
            'candidates.*.lower_tolerance' => 'nullable|numeric',
            'candidates.*.unit' => 'nullable|string|max:20',
            'candidates.*.gdt_symbol' => 'nullable|string|max:10',
        ]);

        $doc = Drawing::where('id', $data['fai_document_id'])
            ->where('plan_id', $plan->id)
            ->firstOrFail();

        $created = DB::transaction(function () use ($plan, $data, $doc, $request) {
            $userId = $request->user()->id;
            $startNum = ($plan->balloons()->max('balloon_number') ?? 0) + 1;
            $rows = [];

            foreach ($data['candidates'] as $i => $c) {
                $number = $startNum + $i;

                $balloon = DrawingBalloon::create([
                    'plan_id' => $plan->id,
                    'fai_document_id' => $doc->id,
                    'balloon_number' => $number,
                    'page_number' => $data['page_number'],
                    'x_pct' => $c['x_pct'],
                    'y_pct' => $c['y_pct'],
                    'char_type' => $c['char_type'],
                    'source' => 'ai',
                    'confidence' => $c['confidence'] ?? null,
                    'source_text' => $c['source_text'] ?? null,
                    'accepted_at' => now(),
                    'created_by' => $userId,
                ]);

                // Create the linked characteristic with AI-suggested values
                $char = FaiCharacteristic::create([
                    'plan_id' => $plan->id,
                    'balloon_number' => $number,
                    'char_type' => $c['char_type'],
                    'nominal' => $c['nominal'] ?? null,
                    'upper_tolerance' => $c['upper_tolerance'] ?? null,
                    'lower_tolerance' => $c['lower_tolerance'] ?? null,
                    'unit' => $c['unit'] ?? null,
                    'gdt_symbol' => $c['gdt_symbol'] ?? null,
                    'use_default_tolerance' => false,
                    'sort_order' => $number,
                ]);

                $char->requirement_string = $this->formatter->format($char->toArray());
                $char->save();

                $balloon->characteristic_id = $char->id;
                $balloon->save();

                $rows[] = $balloon->load('characteristic');
            }

            return $rows;
        });

        $plan->recountStats();

        AuditLog::record('balloon.bulk_accepted_ai', [
            'subject_type' => InspectionPlan::class,
            'subject_id' => $plan->id,
            'meta' => ['count' => count($created)],
        ]);

        return response()->json(['balloons' => $created, 'count' => count($created)], 201);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
