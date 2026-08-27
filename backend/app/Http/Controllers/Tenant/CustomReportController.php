<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\CustomInspectionReport;
use App\Models\CustomReportCharacteristic;
use App\Models\CustomReportTemplate;
use App\Models\FaiCharacteristic;
use App\Models\InspectionSession;
use App\Services\CustomReportStatusService;
use App\Services\CustomReportSyncEngine;
use App\Services\PassFailEvaluator;
use App\Services\ReportNumberService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class CustomReportController extends Controller
{
    public function __construct(
        private ReportNumberService $numbers,
        private CustomReportSyncEngine $sync,
        private PassFailEvaluator $eval,
        private CustomReportStatusService $status,
    ) {}

    // -------------------------------------------------------- lifecycle

    public function markComplete(Request $request, int $id): JsonResponse
    {
        $report = CustomInspectionReport::findOrFail($id);
        try {
            $report = $this->status->markComplete($request->user(), $report);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        return response()->json(['report' => $report]);
    }

    public function reopenToDraft(Request $request, int $id): JsonResponse
    {
        $report = CustomInspectionReport::findOrFail($id);
        try {
            $report = $this->status->reopenToDraft($request->user(), $report);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        return response()->json(['report' => $report]);
    }

    public function reopenSigned(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (! $user->hasRole('admin')) {
            abort(403, 'Only admins can reopen a signed report.');
        }

        $data = $request->validate(['reason' => 'required|string|min:5|max:500']);
        $report = CustomInspectionReport::findOrFail($id);
        try {
            $report = $this->status->reopenSigned($user, $report, $data['reason']);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        return response()->json(['report' => $report]);
    }

    /**
     * Auto-create (or fetch) the DEF-QA-003 report for a session that picked
     * 'custom' at Step 3. Hits when inspector lands on the entry page.
     */
    public function ensureForSession(Request $request, int $sessionId): JsonResponse
    {
        $this->checkPermission('inspections.view');

        $session = InspectionSession::with(['part.customer', 'plan'])->findOrFail($sessionId);

        if ($session->session_type !== 'custom') {
            abort(422, 'This session is not a Custom inspection.');
        }

        $report = $session->custom_report_id
            ? CustomInspectionReport::find($session->custom_report_id)
            : null;

        if (! $report) {
            $report = DB::transaction(function () use ($session, $request) {
                $template = CustomReportTemplate::defaultDefQa003();

                $cr = CustomInspectionReport::create([
                    'ir_number' => $this->numbers->next('IR'),
                    'inspection_session_id' => $session->id,
                    'part_id' => $session->part_id,
                    'inspection_plan_id' => $session->inspection_plan_id,
                    'template_id' => $template->id,
                    'fai_form1_id' => $this->findApprovedFaiForPart($session->part_id),
                    'part_number' => $session->part?->part_number,
                    'part_name' => $session->part?->description,
                    'revision' => $session->part?->revision,
                    'quantity' => 1,
                    'inspection_type' => 'final',
                    'tolerance_block' => $template->default_tolerances,
                    'inspector_name' => $request->user()?->name,
                    'status' => 'draft',
                    'created_by' => $request->user()?->id,
                ]);

                $session->custom_report_id = $cr->id;
                $session->save();

                AuditLog::record('custom_report.created', [
                    'subject_type' => CustomInspectionReport::class,
                    'subject_id' => $cr->id,
                    'meta' => [
                        'ir_number' => $cr->ir_number,
                        'part_id' => $cr->part_id,
                        'plan_id' => $cr->inspection_plan_id,
                    ],
                ]);

                return $cr;
            });

            $this->sync->sync($report->fresh('template'));
        }

        return response()->json([
            'report' => $report->load(['template', 'rows.characteristic', 'part:id,part_number,revision,description']),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $this->checkPermission('inspections.view');

        $report = CustomInspectionReport::with([
            'template',
            'part:id,part_number,revision,description,part_type,fai_approved',
            'plan:id,plan_number,plan_name',
            'rows.characteristic',
            'session:id,session_type,current_step,step1_complete,step2_complete,step3_complete,step4_complete,step5_complete,step6_complete',
        ])->findOrFail($id);

        $rows = $report->rows;
        $realRows = $rows->whereNotNull('characteristic_id');
        $passed = $realRows->where('pass_fail', 'pass')->count();
        $failed = $realRows->where('pass_fail', 'fail')->count();
        $notMeasured = $realRows->where('pass_fail', 'not_measured')->count();
        $total = $realRows->count();

        return response()->json([
            'report' => $report,
            'summary' => [
                'total' => $total,
                'passed' => $passed,
                'failed' => $failed,
                'not_measured' => $notMeasured,
                'complete' => $total - $notMeasured,
                'all_done' => $total > 0 && $notMeasured === 0,
            ],
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $report = CustomInspectionReport::findOrFail($id);
        if ($report->isLocked()) {
            abort(409, 'This report is locked.');
        }

        $data = $request->validate([
            'report_title' => 'nullable|string|max:200',
            'serial_lot_number' => 'nullable|string|max:100',
            'work_order' => 'nullable|string|max:100',
            'inspection_type' => 'sometimes|in:receiving,in_process,final,other',
            'quantity' => 'sometimes|integer|min:1',
            'tolerance_block' => 'nullable|string|max:200',
            'tolerance_block_overridden' => 'sometimes|boolean',
        ]);

        $report->fill($data)->save();

        return response()->json(['report' => $report->fresh()]);
    }

    public function updateRow(Request $request, int $id, int $rowId): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $report = CustomInspectionReport::findOrFail($id);
        if ($report->isLocked()) {
            abort(409, 'Report is locked.');
        }

        $row = CustomReportCharacteristic::with('characteristic')
            ->where('custom_report_id', $report->id)
            ->where('id', $rowId)
            ->firstOrFail();

        $data = $request->validate([
            'field6_reference_location' => 'nullable|string|max:100',
            'field7_char_designator' => 'nullable|string|max:50',
            'field9_results' => 'nullable|string|max:1000',
            'field10_qa_acceptance' => 'nullable|in:accept,reject,na',
            'field11_ncr_number' => 'nullable|string|max:30',
            'field14_comments' => 'nullable|string|max:5000',
            'override_flag' => 'sometimes|boolean',
        ]);

        $row->fill($data);

        if (array_key_exists('field9_results', $data)) {
            // Pass/fail still keyed off the source Plan characteristic
            $row->pass_fail = $this->eval->evaluate($row->characteristic, $data['field9_results']);

            // Auto QA Acceptance from pass/fail unless inspector explicitly overrode
            if (! array_key_exists('field10_qa_acceptance', $data)) {
                $row->field10_qa_acceptance = match ($row->pass_fail) {
                    'pass' => 'accept',
                    'fail' => 'reject',
                    default => null,
                };
            }
        }

        $row->save();

        return response()->json(['row' => $row->fresh('characteristic')]);
    }

    public function syncFromPlan(int $id): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $report = CustomInspectionReport::with('template')->findOrFail($id);
        if ($report->isLocked()) {
            abort(409, 'Report is locked.');
        }

        $count = $this->sync->sync($report);

        return response()->json([
            'message' => "Synced {$count} rows from plan.",
            'count' => $count,
        ]);
    }

    /**
     * Import row data from a linked AS9102 Form 3 (when one exists for the part).
     */
    public function importFromFai(int $id): JsonResponse
    {
        $this->checkPermission('inspections.edit');

        $report = CustomInspectionReport::with('template')->findOrFail($id);
        if ($report->isLocked()) {
            abort(409, 'Report is locked.');
        }
        if (! $report->fai_form1_id) {
            abort(422, 'No FAI is linked to this part.');
        }

        // Re-run plan sync first to align row numbers + requirements
        $this->sync->sync($report);

        // Then copy field6/7/9/11/14 from any matching FAI Form 3 row
        $faiRows = DB::table('fai_form3_rows')
            ->where('fai_form1_id', $report->fai_form1_id)
            ->get()
            ->keyBy('balloon_number');

        $imported = 0;
        foreach ($report->rows as $row) {
            if (! $row->balloon_number) continue;
            $src = $faiRows->get($row->balloon_number);
            if (! $src) continue;

            $row->fill([
                'field6_reference_location' => $row->field6_reference_location ?: $src->field6_reference_location,
                'field7_char_designator' => $row->field7_char_designator ?: $src->field7_char_designator,
                'field9_results' => $row->field9_results ?: $src->field9_results,
                'field11_ncr_number' => $row->field11_ncr_number ?: $src->field11_nonconformance_number,
                'field14_comments' => $row->field14_comments ?: $src->field14_additional_comments,
                'pass_fail' => $src->pass_fail,
            ])->save();
            $imported++;
        }

        return response()->json([
            'message' => "Imported {$imported} rows from FAI Form 3.",
            'count' => $imported,
        ]);
    }

    private function findApprovedFaiForPart(int $partId): ?int
    {
        return DB::table('fai_form1')
            ->where('part_id', $partId)
            ->where('status', 'accepted')
            ->orderByDesc('updated_at')
            ->value('id');
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
