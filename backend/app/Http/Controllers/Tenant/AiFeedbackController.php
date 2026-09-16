<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AiCorrection;
use App\Models\ExportLog;
use App\Services\AiFeedbackService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Sprint 7 · AI feedback loop admin surface (Timothy Aug 26 request
 * "AI that gets better over time"). Read-only aggregation of every
 * user correction to an AI-detected balloon, plus a CSV export the
 * shop hands to the prompt-tuning session each week.
 *
 * Guards:
 *   - Admin-only per doc §7.3 (training-data export is sensitive:
 *     drawing content + user identity + IP).
 *   - CSV download writes an ExportLog row (doc §5.6.12 audit trail).
 */
class AiFeedbackController extends Controller
{
    public function __construct(private AiFeedbackService $service) {}

    public function index(Request $request): JsonResponse
    {
        $this->requireAdmin();

        $days = (int) $request->query('days', 30);
        $days = max(1, min($days, 365));

        $recent = AiCorrection::with(['user:id,name', 'drawing:id,original_filename', 'plan:id,plan_number'])
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn ($r) => [
                'id' => $r->id,
                'created_at' => $r->created_at?->toIso8601String(),
                'type' => $r->correction_type,
                'plan_id' => $r->plan_id,
                'plan_number' => $r->plan?->plan_number,
                'drawing_id' => $r->drawing_id,
                'drawing_filename' => $r->drawing?->original_filename,
                'page_number' => $r->page_number,
                'balloon_id' => $r->balloon_id,
                'original_char_type' => $r->original_char_type,
                'corrected_char_type' => $r->corrected_char_type,
                'original_x_pct' => $r->original_x_pct,
                'original_y_pct' => $r->original_y_pct,
                'corrected_x_pct' => $r->corrected_x_pct,
                'corrected_y_pct' => $r->corrected_y_pct,
                'user_name' => $r->user?->name,
            ]);

        return response()->json([
            'summary' => $this->service->summary($days),
            'recent' => $recent,
        ]);
    }

    public function exportCsv(Request $request): StreamedResponse
    {
        $this->requireAdmin();

        $filename = 'ai-corrections-' . now()->format('Ymd-His') . '.csv';

        // Snapshot user identity BEFORE the stream closure runs — the
        // request context may have advanced by then.
        $user = $request->user();
        $ip = $request->ip();
        $userAgent = substr((string) $request->userAgent(), 0, 500);

        ExportLog::create([
            'subject_type' => AiCorrection::class,
            'subject_id' => 0, // batch export, no single subject
            'format' => ExportLog::FORMAT_EXCEL, // reuse enum; CSV is a spreadsheet format
            'file_name' => $filename,
            'file_size_bytes' => null,
            'exported_by' => $user->id,
            'exported_by_name' => $user->name,
            'ip_address' => $ip,
            'user_agent' => $userAgent,
            'exported_at' => now(),
        ]);

        return response()->streamDownload(function () {
            $handle = fopen('php://output', 'w');
            foreach ($this->service->csvRows() as $row) {
                fputcsv($handle, $row);
            }
            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    private function requireAdmin(): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasRole('admin')) {
            abort(403, 'Only admins can view AI feedback data.');
        }
    }
}
