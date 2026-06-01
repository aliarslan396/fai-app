<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Drawing;
use App\Models\DrawingPage;
use App\Models\Part;
use App\Services\DrawingProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;

class DrawingController extends Controller
{
    public function __construct(private DrawingProcessor $processor) {}

    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('drawings.view');

        $query = Drawing::query()->with(['uploader:id,name,email'])->withCount('pages');

        if ($partId = $request->input('part_id')) {
            $query->where('part_id', $partId);
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $drawings = $query->orderByDesc('created_at')
            ->paginate($request->input('per_page', 25));

        return response()->json([
            'data' => $drawings->items(),
            'total' => $drawings->total(),
            'per_page' => $drawings->perPage(),
            'current_page' => $drawings->currentPage(),
            'last_page' => $drawings->lastPage(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $this->checkPermission('drawings.view');

        $drawing = Drawing::with(['pages', 'part:id,part_number,revision,description', 'uploader:id,name,email'])
            ->findOrFail($id);

        return response()->json(['drawing' => $drawing]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->checkPermission('drawings.upload');

        $data = $request->validate([
            'part_id' => 'required|integer|exists:parts,id',
            'file' => 'required|file|mimes:pdf,jpg,jpeg,png,tiff,tif|max:51200', // 50MB
            'drawing_number' => 'nullable|string|max:100',
            'revision' => 'nullable|string|max:20',
        ]);

        $file = $request->file('file');
        $part = Part::findOrFail($data['part_id']);

        $tenantKey = tenant()?->getTenantKey() ?? 'default';
        $storedPath = $file->store("drawings/{$tenantKey}/_uploads", 'local');

        $drawing = Drawing::create([
            'part_id' => $part->id,
            'original_filename' => $file->getClientOriginalName(),
            'file_path' => $storedPath,
            'mime_type' => $file->getClientMimeType(),
            'file_size' => $file->getSize(),
            'drawing_number' => $data['drawing_number'] ?? null,
            'revision' => $data['revision'] ?? null,
            'page_count' => 0,
            'status' => 'uploaded',
            'uploaded_by' => $request->user()->id,
        ]);

        AuditLog::record('drawing.uploaded', [
            'subject_type' => Drawing::class,
            'subject_id' => $drawing->id,
            'meta' => [
                'filename' => $drawing->original_filename,
                'size' => $drawing->file_size,
                'part_id' => $part->id,
            ],
        ]);

        try {
            $this->processor->process($drawing);
        } catch (\Throwable $e) {
            return response()->json([
                'drawing' => $drawing->fresh(),
                'message' => 'Drawing uploaded but page rendering failed. See processing_error.',
                'error' => $e->getMessage(),
            ], 207);
        }

        return response()->json([
            'drawing' => $drawing->fresh(['pages']),
            'message' => 'Drawing uploaded and processed',
        ], 201);
    }

    public function destroy(int $id, Request $request): JsonResponse
    {
        $this->checkPermission('drawings.delete');

        $drawing = Drawing::findOrFail($id);

        // Remove rendered pages + uploaded source
        $tenantKey = tenant()?->getTenantKey() ?? 'default';
        $pageDir = storage_path("app/drawings/{$tenantKey}/{$drawing->id}");
        if (is_dir($pageDir)) {
            $this->rmrf($pageDir);
        }
        Storage::disk('local')->delete($drawing->file_path);

        AuditLog::record('drawing.deleted', [
            'subject_type' => Drawing::class,
            'subject_id' => $drawing->id,
            'meta' => [
                'filename' => $drawing->original_filename,
                'part_id' => $drawing->part_id,
            ],
        ]);

        $drawing->delete();

        return response()->json(['message' => 'Drawing deleted']);
    }

    /**
     * Serve a rendered page image (full size).
     */
    public function pageImage(int $id, int $page): Response|BinaryFileResponse
    {
        $this->checkPermission('drawings.view');

        $pageRow = DrawingPage::where('drawing_id', $id)
            ->where('page_number', $page)
            ->firstOrFail();

        $path = storage_path('app/' . $pageRow->image_path);
        if (! file_exists($path)) {
            abort(404, 'Page image missing on disk');
        }

        return response()->file($path, [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    /**
     * Serve a rendered page thumbnail.
     */
    public function pageThumbnail(int $id, int $page): Response|BinaryFileResponse
    {
        $this->checkPermission('drawings.view');

        $pageRow = DrawingPage::where('drawing_id', $id)
            ->where('page_number', $page)
            ->firstOrFail();

        $path = storage_path('app/' . $pageRow->thumbnail_path);
        if (! file_exists($path)) {
            abort(404, 'Thumbnail missing on disk');
        }

        return response()->file($path, [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'private, max-age=86400',
        ]);
    }

    /**
     * Download the original uploaded file.
     */
    public function download(int $id): BinaryFileResponse
    {
        $this->checkPermission('drawings.view');

        $drawing = Drawing::findOrFail($id);

        AuditLog::record('drawing.downloaded', [
            'subject_type' => Drawing::class,
            'subject_id' => $drawing->id,
        ]);

        return response()->download(
            Storage::disk('local')->path($drawing->file_path),
            $drawing->original_filename
        );
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }

    private function rmrf(string $dir): void
    {
        if (! is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = "{$dir}/{$item}";
            is_dir($path) ? $this->rmrf($path) : unlink($path);
        }
        rmdir($dir);
    }
}
