<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Gauge;
use App\Models\GaugeCalibration;
use App\Services\GaugeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * REST API for gauge master + calibration records.
 * Mutations go through GaugeService — status is always derived server-side.
 */
class GaugeController extends Controller
{
    public function __construct(private GaugeService $service) {}

    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('gauges.view');

        $query = Gauge::query()
            ->with(['creator:id,name'])
            ->orderBy('gauge_id');

        if ($status = $request->query('status')) {
            // Status is derived; filter in PHP after fetch (simpler than complex SQL)
            $all = $query->get();
            $filtered = $all->filter(fn ($g) => $g->status === $status)->values();
            return response()->json(['gauges' => $filtered]);
        }
        if ($type = $request->query('type')) {
            $query->where('type', $type);
        }

        return response()->json(['gauges' => $query->paginate(50)]);
    }

    public function show(int $id): JsonResponse
    {
        $this->checkPermission('gauges.view');

        $gauge = Gauge::with([
            'creator:id,name',
            'calibrations.recorder:id,name',
            'calibrations.ncr:id,ncr_number,status',
        ])->findOrFail($id);

        return response()->json(['gauge' => $gauge]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->checkPermission('gauges.create');

        $data = $request->validate([
            'gauge_id' => 'required|string|max:60|unique:gauges,gauge_id',
            'type' => 'required|string|max:60',
            'manufacturer' => 'nullable|string|max:100',
            'model' => 'nullable|string|max:100',
            'serial_number' => 'nullable|string|max:100',
            'range' => 'nullable|string|max:60',
            'resolution' => 'nullable|string|max:60',
            'location' => 'nullable|string|max:100',
            'calibration_interval_months' => 'nullable|integer|min:1|max:120',
            'last_calibrated_at' => 'nullable|date',
            'out_of_service' => 'nullable|boolean',
            'out_of_service_reason' => 'nullable|string',
        ]);

        $gauge = $this->service->createGauge($request->user(), $data);

        return response()->json(['gauge' => $gauge->fresh(['creator:id,name'])], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('gauges.edit');

        $data = $request->validate([
            'gauge_id' => 'sometimes|string|max:60|unique:gauges,gauge_id,' . $id,
            'type' => 'sometimes|string|max:60',
            'manufacturer' => 'nullable|string|max:100',
            'model' => 'nullable|string|max:100',
            'serial_number' => 'nullable|string|max:100',
            'range' => 'nullable|string|max:60',
            'resolution' => 'nullable|string|max:60',
            'location' => 'nullable|string|max:100',
            'calibration_interval_months' => 'sometimes|integer|min:1|max:120',
            'out_of_service' => 'sometimes|boolean',
            'out_of_service_reason' => 'nullable|string',
        ]);

        $gauge = Gauge::findOrFail($id);
        $gauge = $this->service->updateGauge($request->user(), $gauge, $data);

        return response()->json(['gauge' => $gauge]);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->checkPermission('gauges.edit');

        $gauge = Gauge::findOrFail($id);
        $gauge->delete();

        return response()->json(['ok' => true]);
    }

    public function recordCalibration(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('gauges.calibrate');

        $data = $request->validate([
            'calibrated_at' => 'nullable|date',
            'calibrated_by' => 'required|string|max:100',
            'cert_number' => 'nullable|string|max:100',
            'as_found' => 'nullable|string',
            'as_left' => 'nullable|string',
            'result' => 'required|in:pass,fail_oot,limited_use',
            'notes' => 'nullable|string',
            'cert_file' => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:10240',
        ]);

        $gauge = Gauge::findOrFail($id);

        try {
            $calibration = $this->service->recordCalibration(
                $request->user(),
                $gauge,
                $data,
                $request->file('cert_file'),
            );
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 400);
        }

        return response()->json([
            'calibration' => $calibration->fresh(['recorder:id,name']),
            'gauge' => $gauge->fresh(),
        ], 201);
    }

    public function certFile(int $calibrationId): Response|BinaryFileResponse
    {
        $this->checkPermission('gauges.view');

        $cal = GaugeCalibration::findOrFail($calibrationId);
        if (! $cal->cert_file_path) {
            abort(404, 'No cert file on record');
        }

        $abs = Storage::disk('local')->path($cal->cert_file_path);
        if (! file_exists($abs)) {
            abort(404, 'Cert file missing on disk');
        }

        return response()->file($abs, [
            'Content-Type' => 'application/pdf',
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
