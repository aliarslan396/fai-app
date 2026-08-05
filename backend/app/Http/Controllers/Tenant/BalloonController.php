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

        // Verify the document belongs to this plan's parent part (a
        // drawing uploaded on the Part page has no plan_id but must
        // still be balloonable inside every plan for that part).
        $doc = Drawing::where('id', $data['fai_document_id'])
            ->where('part_id', $plan->part_id)
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
     * Reads stored OCR text blocks → merges adjacent blocks on the same
     * line → classifies each merged group via Ollama → returns candidates
     * split into auto-accept (high confidence) and review-needed
     * (medium confidence) buckets. Low confidence + skip results hidden.
     */
    public function autoDetect(int $planId, int $drawingId, int $pageNumber): JsonResponse
    {
        $this->checkPermission('plans.edit');

        $plan = InspectionPlan::findOrFail($planId);
        // A drawing belongs to this plan's workspace if it's either
        // plan-scoped OR part-scoped (uploaded on the Part page — the
        // common case). Match the InspectionPlan::documents() relation.
        $drawing = Drawing::where('id', $drawingId)
            ->where('part_id', $plan->part_id)
            ->firstOrFail();

        $page = DrawingPage::where('drawing_id', $drawing->id)
            ->where('page_number', $pageNumber)
            ->firstOrFail();

        if (! $page->ocr_text || empty($page->ocr_text['blocks'] ?? [])) {
            // Auto-queue OCR so the user isn't stuck on a dead-end error —
            // OCR sidecar returns in 30-60s, then a Retry click succeeds.
            $tenantId = tenant('id');
            \App\Jobs\RunOcrOnDrawingPage::dispatch($tenantId, $page->id);

            return response()->json([
                'message' => 'OCR is running on this page (takes 30-60 seconds). Wait a moment then click Retry.',
                'ocr_queued' => true,
                'candidates' => [],
            ], 202);
        }

        $blocks = $page->ocr_text['blocks'];

        // Step 1: Merge adjacent blocks on the same horizontal line.
        // Tesseract returns "1.500", "±0.005", "in" as separate blocks.
        // We need them as a single merged string for the LLM.
        $merged = $this->mergeAdjacentBlocks($blocks);

        // Step 2: Keep only blocks that look dimensional.
        // Also reject blocks in the extreme top/bottom of page (title block
        // and PDM-export footer) where dim text almost never lives but lots
        // of garbage does.
        $pageH = (int) ($page->ocr_text['height'] ?? $page->height ?? 1);
        $topReject = (int) round($pageH * 0.025);     // top 2.5% = title bar
        $bottomReject = (int) round($pageH * 0.965);  // bottom 3.5% = footer

        $dimensionLike = array_values(array_filter($merged, function ($b) use ($topReject, $bottomReject) {
            $text = (string) ($b['text'] ?? '');
            $bbox = $b['bbox'] ?? [0, 0, 0, 0];
            $blockTop = (int) ($bbox[1] ?? 0);
            $blockBottom = $blockTop + (int) ($bbox[3] ?? 0);

            // Position filter — strip extreme top/bottom strips
            if ($blockBottom <= $topReject) {
                return false;
            }
            if ($blockTop >= $bottomReject) {
                return false;
            }

            // Has digit OR GD&T glyph
            if (preg_match('/[⊕⊥⏥⌭⌒⌓∠∥◎≡↗⇗○⏤Ø∅]/u', $text)) {
                return true;
            }
            if (! preg_match('/\d/', $text)) {
                return false;
            }
            // Drop very short pure-numeric strings (zone markers)
            if (preg_match('/^\s*\d{1,3}\s*$/', $text)) {
                return false;
            }
            // Drop "1/1", "2/6" page indicators
            if (preg_match('/^\s*\d+\s*\/\s*\d+\s*$/', $text)) {
                return false;
            }
            // Drop "2X", "4X" multipliers
            if (preg_match('/^\s*\d+\s*[xX]\s*$/', $text)) {
                return false;
            }
            // Drop square-bracket find numbers "[22 ]", "[401]"
            if (preg_match('/^\s*\[\s*\d+\s*\]\s*$/', $text)) {
                return false;
            }
            // Drop comma-separated rev tags "06887, -.26,"
            if (preg_match('/^\d{4,},\s*-?\.?\d*,/', $text)) {
                return false;
            }
            // Drop cage codes (5-digit pure integers)
            if (preg_match('/^\d{5}$/', $text)) {
                return false;
            }
            return true;
        }));

        if (empty($dimensionLike)) {
            return response()->json([
                'auto_accept' => [],
                'review' => [],
                'message' => 'No dimensional text found',
            ]);
        }

        $texts = array_map(fn ($b) => $b['text'], $dimensionLike);

        try {
            $classifications = $this->ocr->classifyBatch($texts);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'AI classifier unreachable: '.$e->getMessage()], 503);
        }

        $width = (int) ($page->ocr_text['width'] ?? $page->width ?? 1);
        $height = (int) ($page->ocr_text['height'] ?? $page->height ?? 1);

        $autoAccept = [];
        $review = [];

        foreach ($dimensionLike as $i => $block) {
            $cls = $classifications[$i] ?? null;
            if (! $cls) {
                continue;
            }

            // Hide skip + low-confidence completely
            $ctype = $cls['char_type'] ?? 'skip';
            $confidence = (float) ($cls['confidence'] ?? 0);
            if ($ctype === 'skip' || $confidence < 0.5) {
                continue;
            }

            [$x, $y, $w, $h] = $block['bbox'];
            $candidate = [
                'source_text' => $block['text'],
                'ocr_confidence' => $block['confidence'] ?? null,
                'x_pct' => $width > 0 ? round((($x + $w / 2) / $width) * 100, 4) : 0,
                'y_pct' => $height > 0 ? round((($y + $h / 2) / $height) * 100, 4) : 0,
                'bbox' => $block['bbox'],
                'char_type' => $ctype,
                'nominal' => $cls['nominal'] ?? null,
                'upper_tolerance' => $cls['upper_tolerance'] ?? null,
                'lower_tolerance' => $cls['lower_tolerance'] ?? null,
                'unit' => $cls['unit'] ?? null,
                'gdt_symbol' => $cls['gdt_symbol'] ?? null,
                'gdt_datums' => $cls['gdt_datums'] ?? [],
                'finish_value' => $cls['finish_value'] ?? null,
                'finish_unit' => $cls['finish_unit'] ?? null,
                'is_reference' => $cls['is_reference'] ?? false,
                'confidence' => $confidence,
            ];

            // Bucket: auto-accept >=0.85, review 0.5-0.85
            if ($confidence >= 0.85) {
                $autoAccept[] = $candidate;
            } else {
                $review[] = $candidate;
            }
        }

        usort($autoAccept, fn ($a, $b) => $b['confidence'] <=> $a['confidence']);
        usort($review, fn ($a, $b) => $b['confidence'] <=> $a['confidence']);

        return response()->json([
            'auto_accept' => $autoAccept,
            'review' => $review,
            'page_size' => ['width' => $width, 'height' => $height],
            'stats' => [
                'total_ocr_blocks' => count($blocks),
                'merged_blocks' => count($merged),
                'dimension_like' => count($dimensionLike),
                'auto_accepted' => count($autoAccept),
                'needs_review' => count($review),
            ],
        ]);
    }

    /**
     * Merge OCR blocks that sit on the same horizontal line within close
     * horizontal proximity. Tesseract splits "1.500 ±0.005 in" into 3
     * separate blocks; the LLM needs them as one string to classify properly.
     *
     * Rule of thumb: two blocks merge if
     *   - vertical midpoints overlap within 60% of the taller block's height
     *   - horizontal gap between them is less than 2x the average char width
     *
     * @param  array<int, array{text:string, bbox:array<int>, confidence:float}>  $blocks
     * @return array<int, array{text:string, bbox:array<int>, confidence:float}>
     */
    private function mergeAdjacentBlocks(array $blocks): array
    {
        if (empty($blocks)) {
            return [];
        }

        // Sort by y then x for predictable merging
        usort($blocks, function ($a, $b) {
            $ay = $a['bbox'][1] ?? 0;
            $by = $b['bbox'][1] ?? 0;
            if (abs($ay - $by) < 5) {
                return ($a['bbox'][0] ?? 0) <=> ($b['bbox'][0] ?? 0);
            }
            return $ay <=> $by;
        });

        $merged = [];
        foreach ($blocks as $block) {
            $bbox = $block['bbox'] ?? [0, 0, 0, 0];
            $text = (string) ($block['text'] ?? '');
            $conf = (float) ($block['confidence'] ?? 0);
            if ($text === '') {
                continue;
            }

            $last = end($merged) ?: null;
            if ($last !== null && $this->canMerge($last, $block)) {
                // Merge into the last group
                $idx = array_key_last($merged);
                $merged[$idx]['text'] = trim($last['text']).' '.trim($text);
                $merged[$idx]['bbox'] = $this->mergeBbox($last['bbox'], $bbox);
                $merged[$idx]['confidence'] = min($last['confidence'], $conf);
            } else {
                $merged[] = [
                    'text' => $text,
                    'bbox' => $bbox,
                    'confidence' => $conf,
                ];
            }
        }

        return $merged;
    }

    private function canMerge(array $a, array $b): bool
    {
        $aBox = $a['bbox'] ?? [0, 0, 0, 0];
        $bBox = $b['bbox'] ?? [0, 0, 0, 0];

        [$ax, $ay, $aw, $ah] = $aBox;
        [$bx, $by, $bw, $bh] = $bBox;

        $aText = (string) $a['text'];
        $bText = (string) $b['text'];

        // Vertical line check — midpoints within 30% of taller block height
        // (tightened from 50% — engineering drawings have lots of stacked text)
        $aMid = $ay + $ah / 2;
        $bMid = $by + $bh / 2;
        $tol = max($ah, $bh) * 0.3;
        if (abs($aMid - $bMid) > $tol) {
            return false;
        }

        // Character height mismatch — different size text is usually different
        // semantic groups (title block big vs dim small). Reject merge if
        // heights differ by >40%.
        $hRatio = max($ah, $bh) / max(min($ah, $bh), 1);
        if ($hRatio > 1.4) {
            return false;
        }

        // Horizontal gap check — must be near each other
        $aRight = $ax + $aw;
        $gap = $bx - $aRight;
        $avgCharW = max($aw / max(strlen($aText), 1), 5);

        // Tightened from 2.5 -> 1.5 char widths. Real dim parts like "1.500"
        // and "±0.005" sit very close; title-block fragments sit further apart.
        if ($gap > $avgCharW * 1.5) {
            return false;
        }
        if ($gap < 0) {
            // Overlapping is fine — but cap combined length to avoid runaway
            // merges across columns.
            return strlen($aText.' '.$bText) <= 60;
        }

        // Don't grow merged text past 60 chars — real dim callouts are short.
        if (strlen($aText.' '.$bText) > 60) {
            return false;
        }

        // If one side is mostly letters (word) and the other is mostly digits,
        // skip the merge — they're semantically different.
        $aLetters = preg_match_all('/[A-Za-z]/', $aText);
        $aDigits = preg_match_all('/\d/', $aText);
        $bLetters = preg_match_all('/[A-Za-z]/', $bText);
        $bDigits = preg_match_all('/\d/', $bText);

        $aIsWordy = $aLetters > 0 && $aDigits === 0 && strlen($aText) > 3;
        $bIsWordy = $bLetters > 0 && $bDigits === 0 && strlen($bText) > 3;
        if ($aIsWordy !== $bIsWordy) {
            return false;
        }

        return true;
    }

    private function mergeBbox(array $a, array $b): array
    {
        [$ax, $ay, $aw, $ah] = $a;
        [$bx, $by, $bw, $bh] = $b;
        $left = min($ax, $bx);
        $top = min($ay, $by);
        $right = max($ax + $aw, $bx + $bw);
        $bottom = max($ay + $ah, $by + $bh);
        return [$left, $top, $right - $left, $bottom - $top];
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
            ->where('part_id', $plan->part_id)
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
