<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Services\CsvImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Endpoints for CSV bulk import (doc 3.1 / 3.5).
 * Two-phase: preview (no writes) + commit (transactional insert).
 * Template downloads seed the client with the exact expected shape.
 */
class CsvImportController extends Controller
{
    public function __construct(private CsvImportService $service) {}

    public function previewParts(Request $request): JsonResponse
    {
        $this->checkPermission('parts.create');
        $file = $this->requireCsv($request);
        return $this->safe(fn () => response()->json($this->stripInternalRows($this->service->previewParts($file))));
    }

    public function commitParts(Request $request): JsonResponse
    {
        $this->checkPermission('parts.create');
        $file = $this->requireCsv($request);
        return $this->safe(fn () => response()->json($this->service->commitParts($file, $request->user())));
    }

    public function previewPlans(Request $request): JsonResponse
    {
        $this->checkPermission('plans.create');
        $file = $this->requireCsv($request);
        return $this->safe(fn () => response()->json($this->stripInternalRows($this->service->previewPlans($file))));
    }

    public function commitPlans(Request $request): JsonResponse
    {
        $this->checkPermission('plans.create');
        $file = $this->requireCsv($request);
        return $this->safe(fn () => response()->json($this->service->commitPlans($file, $request->user())));
    }

    public function partsTemplate(): Response
    {
        $this->checkPermission('parts.create');
        return response($this->service->partsTemplate(), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="parts_import_template.csv"',
        ]);
    }

    public function plansTemplate(): Response
    {
        $this->checkPermission('plans.create');
        return response($this->service->plansTemplate(), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="plans_import_template.csv"',
        ]);
    }

    // ------------------------------------------------------------- helpers

    private function requireCsv(Request $request): \Illuminate\Http\UploadedFile
    {
        $request->validate([
            'file' => 'required|file|max:5120', // 5 MB
        ]);
        return $request->file('file');
    }

    /** Strip the full new_rows payload — only sample is UI-safe to return. */
    private function stripInternalRows(array $analysis): array
    {
        unset($analysis['new_rows']);
        return $analysis;
    }

    private function safe(\Closure $fn)
    {
        try {
            return $fn();
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
