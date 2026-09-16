<?php

namespace App\Services;

use App\Models\AiCorrection;
use App\Models\AuditLog;
use App\Models\DrawingBalloon;
use App\Models\TenantUser;
use Illuminate\Support\Facades\DB;

/**
 * AI feedback loop — records every user correction to an AI-detected
 * balloon (source=ocr). Feeds the weekly CSV export used to tune the
 * Ollama/Mistral prompt.
 *
 * Only balloons with source='ocr' generate corrections. User-placed
 * (source='manual') edits are not logged — a manual placement being
 * corrected teaches the AI nothing.
 */
class AiFeedbackService
{
    public function recordReposition(
        TenantUser $user,
        DrawingBalloon $balloon,
        float $newXPct,
        float $newYPct,
        float $originalXPct,
        float $originalYPct,
    ): ?AiCorrection {
        if ($balloon->source !== 'ocr') {
            return null;
        }

        return $this->write($user, $balloon, [
            'correction_type' => AiCorrection::TYPE_REPOSITION,
            'original_x_pct' => $originalXPct,
            'original_y_pct' => $originalYPct,
            'corrected_x_pct' => $newXPct,
            'corrected_y_pct' => $newYPct,
            'original_char_type' => $balloon->char_type,
        ]);
    }

    public function recordReject(TenantUser $user, DrawingBalloon $balloon): ?AiCorrection
    {
        if ($balloon->source !== 'ocr') {
            return null;
        }

        return $this->write($user, $balloon, [
            'correction_type' => AiCorrection::TYPE_REJECT,
            'original_x_pct' => (float) $balloon->x_pct,
            'original_y_pct' => (float) $balloon->y_pct,
            'original_char_type' => $balloon->char_type,
        ]);
    }

    public function recordRelabel(
        TenantUser $user,
        DrawingBalloon $balloon,
        string $originalCharType,
        string $newCharType,
    ): ?AiCorrection {
        if ($balloon->source !== 'ocr' || $originalCharType === $newCharType) {
            return null;
        }

        return $this->write($user, $balloon, [
            'correction_type' => AiCorrection::TYPE_RELABEL,
            'original_char_type' => $originalCharType,
            'corrected_char_type' => $newCharType,
            'original_x_pct' => (float) $balloon->x_pct,
            'original_y_pct' => (float) $balloon->y_pct,
        ]);
    }

    private function write(TenantUser $user, DrawingBalloon $balloon, array $data): AiCorrection
    {
        return DB::transaction(function () use ($user, $balloon, $data) {
            $row = AiCorrection::create(array_merge($data, [
                'plan_id' => $balloon->plan_id,
                'balloon_id' => $balloon->id,
                'drawing_id' => $balloon->fai_document_id,
                'page_number' => $balloon->page_number,
                'user_id' => $user->id,
            ]));

            AuditLog::record('ai.correction', [
                'subject_type' => AiCorrection::class,
                'subject_id' => $row->id,
                'meta' => [
                    'type' => $row->correction_type,
                    'balloon_id' => $balloon->id,
                    'plan_id' => $balloon->plan_id,
                    'user_id' => $user->id,
                ],
            ]);

            return $row;
        });
    }

    /**
     * KPI payload for the admin dashboard.
     */
    public function summary(int $days = 30): array
    {
        $since = now()->subDays($days);

        $recent = AiCorrection::where('created_at', '>=', $since);
        $byType = (clone $recent)->selectRaw('correction_type, COUNT(*) as c')->groupBy('correction_type')->pluck('c', 'correction_type');

        $topDrawings = (clone $recent)
            ->selectRaw('drawing_id, COUNT(*) as c')
            ->groupBy('drawing_id')
            ->orderByDesc('c')
            ->limit(5)
            ->with('drawing:id,original_filename')
            ->get()
            ->map(fn ($r) => [
                'drawing_id' => $r->drawing_id,
                'filename' => $r->drawing?->original_filename,
                'count' => (int) $r->c,
            ]);

        return [
            'window_days' => $days,
            'total_corrections' => AiCorrection::count(),
            'recent_count' => (clone $recent)->count(),
            'by_type' => [
                AiCorrection::TYPE_REPOSITION => (int) ($byType[AiCorrection::TYPE_REPOSITION] ?? 0),
                AiCorrection::TYPE_REJECT => (int) ($byType[AiCorrection::TYPE_REJECT] ?? 0),
                AiCorrection::TYPE_RELABEL => (int) ($byType[AiCorrection::TYPE_RELABEL] ?? 0),
            ],
            'top_drawings' => $topDrawings,
        ];
    }

    /**
     * Streaming-safe CSV rows for the prompt-tuning export.
     */
    public function csvRows(): iterable
    {
        yield [
            'id', 'created_at', 'plan_id', 'drawing_id', 'page',
            'type', 'original_x_pct', 'original_y_pct', 'corrected_x_pct', 'corrected_y_pct',
            'original_char_type', 'corrected_char_type', 'original_ocr_text', 'user_id', 'user_notes',
        ];

        foreach (AiCorrection::orderBy('created_at')->cursor() as $r) {
            yield [
                $r->id,
                $r->created_at?->toIso8601String(),
                $r->plan_id,
                $r->drawing_id,
                $r->page_number,
                $r->correction_type,
                $r->original_x_pct,
                $r->original_y_pct,
                $r->corrected_x_pct,
                $r->corrected_y_pct,
                $r->original_char_type,
                $r->corrected_char_type,
                $r->original_ocr_text,
                $r->user_id,
                $r->user_notes,
            ];
        }
    }
}
