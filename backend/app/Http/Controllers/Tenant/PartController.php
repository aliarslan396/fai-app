<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Part;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Minimal Parts CRUD for Week 5 — enough to attach drawings to parts.
 * Full module (CSV import, bulk, customer dropdown UI) lands in Week 9.
 */
class PartController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('parts.view');

        $query = Part::query()->with(['customer:id,name,code']);

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('part_number', 'ilike', "%{$search}%")
                    ->orWhere('description', 'ilike', "%{$search}%")
                    ->orWhere('revision', 'ilike', "%{$search}%");
            });
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($customerId = $request->input('customer_id')) {
            $query->where('customer_id', $customerId);
        }

        $parts = $query->orderByDesc('created_at')
            ->paginate($request->input('per_page', 25));

        return response()->json([
            'data' => $parts->items(),
            'total' => $parts->total(),
            'per_page' => $parts->perPage(),
            'current_page' => $parts->currentPage(),
            'last_page' => $parts->lastPage(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $this->checkPermission('parts.view');

        $part = Part::with(['customer:id,name,code', 'creator:id,name,email'])
            ->withCount('drawings')
            ->findOrFail($id);

        return response()->json(['part' => $part]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->checkPermission('parts.create');

        $data = $request->validate([
            'part_number' => 'required|string|min:1|max:100',
            'revision' => 'required|string|min:1|max:20',
            'description' => 'required|string|min:2|max:500',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'material' => 'nullable|string|max:100',
            'process' => 'nullable|string|max:100',
            'classification' => 'nullable|in:critical,major,minor',
            'status' => 'sometimes|in:active,obsolete,hold',
            'notes' => 'nullable|string|max:2000',
        ]);

        // Enforce uniqueness on (part_number, revision)
        $exists = Part::where('part_number', $data['part_number'])
            ->where('revision', $data['revision'])
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'A part with this part number + revision already exists.',
                'errors' => ['part_number' => ['Already exists at this revision.']],
            ], 422);
        }

        $data['created_by'] = $request->user()->id;
        $part = Part::create($data);

        AuditLog::record('part.created', [
            'subject_type' => Part::class,
            'subject_id' => $part->id,
            'new_values' => $part->only(['part_number', 'revision', 'description', 'status']),
        ]);

        return response()->json([
            'part' => $part->load('customer:id,name,code'),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('parts.edit');

        $part = Part::findOrFail($id);

        $data = $request->validate([
            'part_number' => 'sometimes|string|min:1|max:100',
            'revision' => 'sometimes|string|min:1|max:20',
            'description' => 'sometimes|string|min:2|max:500',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'material' => 'nullable|string|max:100',
            'process' => 'nullable|string|max:100',
            'classification' => 'nullable|in:critical,major,minor',
            'status' => 'sometimes|in:active,obsolete,hold',
            'notes' => 'nullable|string|max:2000',
        ]);

        // If part_number or revision changes, recheck uniqueness
        if (isset($data['part_number']) || isset($data['revision'])) {
            $newPn = $data['part_number'] ?? $part->part_number;
            $newRev = $data['revision'] ?? $part->revision;
            $clash = Part::where('part_number', $newPn)
                ->where('revision', $newRev)
                ->where('id', '!=', $part->id)
                ->exists();
            if ($clash) {
                return response()->json([
                    'message' => 'Another part already has this part number + revision.',
                    'errors' => ['part_number' => ['Already exists at this revision.']],
                ], 422);
            }
        }

        $oldValues = $part->only(array_keys($data));
        $part->update($data);

        AuditLog::record('part.updated', [
            'subject_type' => Part::class,
            'subject_id' => $part->id,
            'old_values' => $oldValues,
            'new_values' => $part->only(array_keys($data)),
        ]);

        return response()->json(['part' => $part->load('customer:id,name,code')]);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->checkPermission('parts.delete');

        $part = Part::findOrFail($id);
        $snapshot = $part->only(['part_number', 'revision', 'description']);
        $part->delete();

        AuditLog::record('part.deleted', [
            'subject_type' => Part::class,
            'subject_id' => $id,
            'old_values' => $snapshot,
        ]);

        return response()->json(['message' => 'Part deleted']);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
