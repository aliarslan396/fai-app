<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\CustomReportCharacteristic;
use App\Models\FaiForm3Row;
use App\Models\Ncr;
use App\Services\NcrService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use RuntimeException;

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

    public function __construct(private NcrService $service) {}

    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('ncr.view');

        $query = Ncr::query()
            ->with(['part:id,part_number,description', 'creator:id,name', 'detector:id,name', 'dispositioner:id,name'])
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
            'closer:id,name,email',
            'source',
        ])->findOrFail($id);

        return response()->json(['ncr' => $ncr]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->checkPermission('ncr.create');

        $data = $request->validate([
            'part_id' => 'nullable|integer|exists:parts,id',
            'inspection_session_id' => 'nullable|integer|exists:inspection_sessions,id',
            'lot_serial' => 'nullable|string|max:100',
            'quantity_affected' => 'nullable|integer|min:0',
            'defect_code' => 'nullable|string|max:50',
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
            'detection_point' => 'nullable|in:' . implode(',', Ncr::DETECTION_POINTS),
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
