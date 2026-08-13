<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Capa;
use App\Models\CustomReportCharacteristic;
use App\Models\FaiForm3Row;
use App\Models\Ncr;
use App\Models\NcrAttachment;
use App\Services\CapaService;
use App\Services\NcrService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * REST API for Non-Conformance Reports.
 *
 * Mutations all go through NcrService — controller only validates input,
 * looks up the target row when creating from a failed form row, and
 * translates service exceptions into HTTP responses.
 */
class NcrController extends Controller
{
    /**
     * Whitelist of source model short-names allowed when creating an NCR
     * from a failed form row. Frontend sends "FaiForm3Row" or
     * "CustomReportCharacteristic" — we map to FQCN.
     */
    private const SOURCE_MAP = [
        'FaiForm3Row' => FaiForm3Row::class,
        'CustomReportCharacteristic' => CustomReportCharacteristic::class,
    ];

    public function __construct(
        private NcrService $service,
        private CapaService $capaService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('ncr.view');

        $query = Ncr::query()
            ->with([
                'part:id,part_number,description',
                'creator:id,name',
                'detector:id,name',
                'dispositioner:id,name',
                'verifier:id,name',
            ])
            ->orderByDesc('created_at');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($disposition = $request->query('disposition')) {
            $query->where('disposition', $disposition);
        }
        if ($partId = $request->query('part_id')) {
            $query->where('part_id', $partId);
        }
        if ($sessionId = $request->query('inspection_session_id')) {
            $query->where('inspection_session_id', $sessionId);
        }
        if ($defectCode = $request->query('defect_code')) {
            $query->where('defect_code', $defectCode);
        }
        if ($detectionPoint = $request->query('detection_point')) {
            $query->where('detection_point', $detectionPoint);
        }

        return response()->json(['ncrs' => $query->paginate(50)]);
    }

    public function show(int $id): JsonResponse
    {
        $this->checkPermission('ncr.view');

        $ncr = Ncr::with([
            'part:id,part_number,description',
            'inspectionSession:id',
            'creator:id,name,email',
            'detector:id,name,email',
            'dispositioner:id,name,email',
            'verifier:id,name,email',
            'closer:id,name,email',
            'source',
            'attachments.uploader:id,name',
        ])->findOrFail($id);

        return response()->json(['ncr' => $ncr]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->checkPermission('ncr.create');

        // Required fields per doc 3.10 — AS9100 traceability + Pareto
        // categorization mandates these four are captured at file time:
        //   detection_point, defect_code, lot_serial, quantity_affected.
        // The rest stay optional (Cost of Quality often filled later,
        // cause emerges during investigation, walk-in defects may not
        // have Char Ref / Requirement / Actual data).
        $data = $request->validate([
            'part_id' => 'nullable|integer|exists:parts,id',
            'inspection_session_id' => 'nullable|integer|exists:inspection_sessions,id',
            'lot_serial' => 'required|string|max:100',
            'quantity_affected' => 'required|integer|min:1',
            'defect_code' => 'required|string|max:50',
            'source_type' => 'nullable|string|in:FaiForm3Row,CustomReportCharacteristic',
            'source_id' => 'nullable|integer|min:1',
            'characteristic_ref' => 'nullable|string|max:60',
            'requirement' => 'nullable|string',
            'actual_result' => 'nullable|string|max:60',
            'unit' => 'nullable|string|max:20',
            'severity' => 'required|in:' . implode(',', Ncr::SEVERITIES),
            'cause' => 'nullable|string',
            'material_cost' => 'nullable|numeric|min:0|max:99999999.99',
            'labor_hours' => 'nullable|numeric|min:0|max:9999.99',
            'scrap_value' => 'nullable|numeric|min:0|max:99999999.99',
            'detected_by' => 'nullable|integer|exists:users,id',
            'detection_point' => 'required|in:' . implode(',', Ncr::DETECTION_POINTS),
        ]);

        try {
            if (! empty($data['source_type']) && ! empty($data['source_id'])) {
                $row = $this->findSourceRow($data['source_type'], $data['source_id']);
                // Forward the enhanced fields alongside the snapshot from the
                // failing row so the inspector doesn't have to re-enter them.
                $overrides = array_intersect_key($data, array_flip([
                    'severity', 'cause', 'lot_serial', 'quantity_affected',
                    'defect_code', 'material_cost', 'labor_hours', 'scrap_value',
                    'detected_by', 'detection_point',
                ]));
                $ncr = $this->service->createFromRow($request->user(), $row, $overrides);
            } else {
                // Normalize source_type to FQCN if present
                if (! empty($data['source_type'])) {
                    $data['source_type'] = self::SOURCE_MAP[$data['source_type']];
                }
                $ncr = $this->service->create($request->user(), $data);
            }
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 400);
        }

        return response()->json(['ncr' => $ncr->fresh(['creator:id,name'])], 201);
    }

    public function disposition(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.disposition');

        $data = $request->validate([
            'disposition' => 'required|in:' . implode(',', array_diff(Ncr::DISPOSITIONS, [Ncr::DISPOSITION_PENDING])),
            'notes' => 'nullable|string',
        ]);

        $ncr = Ncr::findOrFail($id);

        try {
            $ncr = $this->service->disposition($request->user(), $ncr, $data['disposition'], $data['notes'] ?? null);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 400);
        }

        return response()->json(['ncr' => $ncr->fresh(['creator:id,name', 'dispositioner:id,name'])]);
    }

    /**
     * Update the enhanced/editable fields on an OPEN NCR. Locked after
     * disposition so the disposition-time snapshot stays truthful for
     * auditors.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.edit');

        $data = $request->validate([
            'lot_serial' => 'nullable|string|max:100',
            'quantity_affected' => 'nullable|integer|min:0',
            'defect_code' => 'nullable|string|max:50',
            'characteristic_ref' => 'nullable|string|max:60',
            'requirement' => 'nullable|string',
            'actual_result' => 'nullable|string|max:60',
            'unit' => 'nullable|string|max:20',
            'severity' => 'sometimes|in:' . implode(',', Ncr::SEVERITIES),
            'cause' => 'nullable|string',
            'material_cost' => 'nullable|numeric|min:0|max:99999999.99',
            'labor_hours' => 'nullable|numeric|min:0|max:9999.99',
            'scrap_value' => 'nullable|numeric|min:0|max:99999999.99',
            'detected_by' => 'nullable|integer|exists:users,id',
            'detection_point' => 'nullable|in:' . implode(',', Ncr::DETECTION_POINTS),
        ]);

        $ncr = Ncr::findOrFail($id);

        try {
            $ncr = $this->service->update($request->user(), $ncr, $data);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 400);
        }

        return response()->json(['ncr' => $ncr->fresh(['creator:id,name', 'detector:id,name'])]);
    }

    /**
     * First half of the two-sign-off close-out per doc 3.10 —
     * confirms corrective action performed. Different user must close.
     */
    public function verify(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.close');

        $data = $request->validate([
            'notes' => 'required|string|min:3|max:2000',
        ]);

        $ncr = Ncr::findOrFail($id);

        try {
            $ncr = $this->service->verify($request->user(), $ncr, $data['notes']);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['ncr' => $ncr->fresh(['creator:id,name', 'dispositioner:id,name', 'verifier:id,name'])]);
    }

    public function close(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.close');

        $data = $request->validate([
            'closure_notes' => 'nullable|string',
        ]);

        $ncr = Ncr::findOrFail($id);

        try {
            $ncr = $this->service->close($request->user(), $ncr, $data['closure_notes'] ?? null);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['ncr' => $ncr->fresh(['creator:id,name', 'dispositioner:id,name', 'closer:id,name'])]);
    }

    /**
     * Escalate NCR to CAPA per doc 3.10. Creates a new CAPA record
     * pre-populated from this NCR's data, links both records
     * bidirectionally, returns the CAPA identifier so the frontend
     * can jump to the CAPA page.
     */
    public function escalateToCapa(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.edit');

        $ncr = Ncr::with('part:id,part_number')->findOrFail($id);

        try {
            $capa = $this->capaService->createFromNcr($request->user(), $ncr);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => "Escalated to {$capa->capa_number}",
            'capa' => $capa,
            'ncr' => $ncr->fresh(['creator:id,name', 'detector:id,name']),
        ], 201);
    }

    // ---- Attachments (doc 3.10) ----------------------------------------------

    /**
     * NCR attachment upload rules per doc 3.10.
     * Enforced here rather than at DB layer so validation errors surface
     * as clean 422 responses instead of Postgres foreign-key / check errors.
     */
    private const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
    private const ATTACHMENT_MAX_COUNT = 10;
    private const ATTACHMENT_MIMES = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/pdf',
    ];

    public function uploadAttachment(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('ncr.edit');

        $ncr = Ncr::findOrFail($id);

        if ($ncr->isClosed()) {
            return response()->json([
                'message' => "Cannot attach to closed NCR {$ncr->ncr_number} — audit trail is immutable after closure.",
            ], 422);
        }

        $request->validate([
            'file' => 'required|file|max:' . (self::ATTACHMENT_MAX_BYTES / 1024) . '|mimes:jpg,jpeg,png,pdf',
        ]);

        $file = $request->file('file');
        if (! in_array($file->getMimeType(), self::ATTACHMENT_MIMES, true)) {
            return response()->json(['message' => 'Only JPG, PNG, or PDF files are allowed.'], 422);
        }

        $existingCount = $ncr->attachments()->count();
        if ($existingCount >= self::ATTACHMENT_MAX_COUNT) {
            return response()->json([
                'message' => 'Attachment limit reached (' . self::ATTACHMENT_MAX_COUNT . ' per NCR). Delete an existing file to add more.',
            ], 422);
        }

        // Store under a UUID filename so users can't guess neighboring
        // files by URL and there's zero collision risk across uploads.
        $tenantKey = tenant()?->getTenantKey() ?? 'default';
        $ext = strtolower($file->getClientOriginalExtension() ?: $file->extension() ?: 'bin');
        $storedName = Str::uuid()->toString() . '.' . $ext;
        $relDir = "ncr_attachments/{$tenantKey}/ncr_{$ncr->id}";
        $storedPath = $file->storeAs($relDir, $storedName, 'local');

        $attachment = NcrAttachment::create([
            'ncr_id' => $ncr->id,
            'original_filename' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType(),
            'size_bytes' => $file->getSize(),
            'storage_path' => $storedPath,
            'uploaded_by' => $request->user()->id,
        ]);

        AuditLog::record('ncr.attachment.added', [
            'subject_type' => Ncr::class,
            'subject_id' => $ncr->id,
            'meta' => [
                'ncr_number' => $ncr->ncr_number,
                'attachment_id' => $attachment->id,
                'filename' => $attachment->original_filename,
                'size' => $attachment->size_bytes,
                'user_id' => $request->user()->id,
            ],
        ]);

        return response()->json([
            'attachment' => $attachment->fresh('uploader:id,name'),
        ], 201);
    }

    /**
     * Stream an attachment file with auth-gated access. The nested-id
     * check makes sure a user can't fetch attachment X from a different
     * NCR by guessing IDs.
     */
    public function attachmentFile(int $id, int $attachmentId): BinaryFileResponse|Response
    {
        $this->checkPermission('ncr.view');

        $attachment = NcrAttachment::where('id', $attachmentId)
            ->where('ncr_id', $id)
            ->firstOrFail();

        $absPath = Storage::disk('local')->path($attachment->storage_path);
        if (! is_readable($absPath)) {
            return response('File missing on disk', 404);
        }

        return response()->file($absPath, [
            'Content-Type' => $attachment->mime_type,
            'Content-Disposition' => 'inline; filename="' . addslashes($attachment->original_filename) . '"',
            'Cache-Control' => 'private, no-cache, max-age=0',
        ]);
    }

    public function deleteAttachment(Request $request, int $id, int $attachmentId): JsonResponse
    {
        $this->checkPermission('ncr.edit');

        $ncr = Ncr::findOrFail($id);
        if ($ncr->isClosed()) {
            return response()->json([
                'message' => "Cannot remove attachments from closed NCR {$ncr->ncr_number}.",
            ], 422);
        }

        $attachment = NcrAttachment::where('id', $attachmentId)
            ->where('ncr_id', $id)
            ->firstOrFail();

        // Only the uploader OR a user with ncr.edit can delete. We already
        // gated on ncr.edit above; explicit uploader-only tier can land later.
        $filename = $attachment->original_filename;

        Storage::disk('local')->delete($attachment->storage_path);
        $attachment->delete();

        AuditLog::record('ncr.attachment.deleted', [
            'subject_type' => Ncr::class,
            'subject_id' => $ncr->id,
            'meta' => [
                'ncr_number' => $ncr->ncr_number,
                'attachment_id' => $attachmentId,
                'filename' => $filename,
                'user_id' => $request->user()->id,
            ],
        ]);

        return response()->json(['message' => 'Attachment removed']);
    }

    private function findSourceRow(string $shortName, int $id): Model
    {
        $class = self::SOURCE_MAP[$shortName] ?? null;
        if (! $class) {
            abort(400, "Unknown source type: {$shortName}");
        }

        return $class::findOrFail($id);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
