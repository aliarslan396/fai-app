<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Gauge;
use App\Models\GaugeCalibration;
use App\Models\GaugeCheckout;
use App\Services\GaugeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use RuntimeException;
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
            'ootAssessments.assessor:id,name',
            'ootAssessments.ncr:id,ncr_number,status',
            'ootAssessments.calibration:id,calibrated_at,cert_number',
            'checkouts.holder:id,name',
            'checkouts.returner:id,name',
            'openCheckout.holder:id,name',
        ])->findOrFail($id);

        return response()->json(['gauge' => $gauge]);
    }

    /**
     * Lightweight autocomplete for Form 3 gage-ID lookup.
     * Returns id, gauge_id, type, status, days_until_due — enough
     * to show a picker with a live status badge without hitting show().
     */
    public function lookup(Request $request): JsonResponse
    {
        $this->checkPermission('gauges.view');

        $q = trim((string) $request->query('q', ''));
        $limit = min((int) $request->query('limit', 20), 50);

        $query = Gauge::query()
            ->where('out_of_service', false)
            ->orderBy('gauge_id')
            ->limit($limit);

        if ($q !== '') {
            $query->where(function ($qq) use ($q) {
                $qq->where('gauge_id', 'ilike', '%' . $q . '%')
                    ->orWhere('type', 'ilike', '%' . $q . '%')
                    ->orWhere('serial_number', 'ilike', '%' . $q . '%');
            });
        }

        $gauges = $query->get(['id', 'gauge_id', 'type', 'serial_number', 'last_calibrated_at', 'next_cal_due', 'out_of_service'])
            ->map(fn ($g) => [
                'id' => $g->id,
                'gauge_id' => $g->gauge_id,
                'type' => $g->type,
                'serial_number' => $g->serial_number,
                'status' => $g->status,
                'days_until_due' => $g->days_until_due,
                'next_cal_due' => $g->next_cal_due?->toDateString(),
            ]);

        return response()->json(['gauges' => $gauges]);
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

    // ---------------------------------------------------------- OOT

    public function recordOot(Request $request, int $id, int $calibrationId): JsonResponse
    {
        $this->checkPermission('gauges.calibrate');

        $data = $request->validate([
            'last_known_good_at' => 'nullable|date',
            'parts_at_risk_summary' => 'nullable|string|max:5000',
            'impact_analysis' => 'required|string|max:5000',
            'containment_action' => 'nullable|string|max:2000',
            'ncr_id' => 'nullable|integer|exists:ncrs,id',
            'disposition' => 'required|string|in:accept_as_is,recall,investigate,no_impact',
        ]);

        $cal = GaugeCalibration::where('gauge_id', $id)->findOrFail($calibrationId);

        try {
            $assessment = $this->service->recordOotAssessment($request->user(), $cal, $data);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 400);
        }

        return response()->json(['assessment' => $assessment], 201);
    }

    // ---------------------------------------------------------- Checkout

    public function checkOut(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('gauges.edit');

        $data = $request->validate([
            'checked_out_to' => 'required|integer|exists:users,id',
            'job_reference' => 'nullable|string|max:100',
            'notes' => 'nullable|string|max:2000',
        ]);

        $gauge = Gauge::findOrFail($id);

        try {
            $checkout = $this->service->checkOut($request->user(), $gauge, $data);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 400);
        }

        return response()->json(['checkout' => $checkout], 201);
    }

    public function checkIn(Request $request, int $id, int $checkoutId): JsonResponse
    {
        $this->checkPermission('gauges.edit');

        $data = $request->validate([
            'notes' => 'nullable|string|max:2000',
        ]);

        $checkout = GaugeCheckout::where('gauge_id', $id)->findOrFail($checkoutId);

        try {
            $updated = $this->service->checkIn($request->user(), $checkout, $data['notes'] ?? null);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['checkout' => $updated]);
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
