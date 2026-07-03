<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\CustomInspectionReport;
use App\Models\FaiForm1;
use App\Models\Signature;
use App\Services\SignatureService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class SignatureController extends Controller
{
    /**
     * Whitelist of signable model short-names allowed from the API.
     * Frontend sends "FaiForm1" or "CustomInspectionReport" — we map to FQCN.
     */
    private const SIGNABLE_MAP = [
        'FaiForm1' => FaiForm1::class,
        'CustomInspectionReport' => CustomInspectionReport::class,
    ];

    public function __construct(private SignatureService $service) {}

    public function store(Request $request): JsonResponse
    {
        $this->checkPermission('inspections.sign');

        $data = $request->validate([
            'signable_type' => 'required|string|in:FaiForm1,CustomInspectionReport',
            'signable_id' => 'required|integer|min:1',
            'signature_role' => 'required|in:inspector,qa_manager,customer_rep',
            'canvas' => 'required|string',          // data:image/png;base64,... or raw base64
            'password' => 'required|string',
        ]);

        $signable = $this->findSignable($data['signable_type'], $data['signable_id']);

        try {
            $signature = $this->service->sign(
                $request->user(),
                $signable,
                $data['canvas'],
                $data['signature_role'],
                $data['password'],
                $request->ip() ?? '0.0.0.0',
                $request->userAgent() ?? '',
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 400);
        }

        return response()->json([
            'signature' => $signature,
            'form_locked_at' => $signable->fresh()->locked_at,
        ], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('inspections.view');

        $data = $request->validate([
            'signable_type' => 'required|string|in:FaiForm1,CustomInspectionReport',
            'signable_id' => 'required|integer|min:1',
        ]);

        $signables = Signature::query()
            ->where('signable_type', self::SIGNABLE_MAP[$data['signable_type']])
            ->where('signable_id', $data['signable_id'])
            ->with('user:id,name,email,cert_number,signature_role_title')
            ->orderBy('signed_at')
            ->get();

        return response()->json(['signatures' => $signables]);
    }

    public function image(int $id): Response|BinaryFileResponse
    {
        return $this->serveImage($id, 'signature_image_path');
    }

    public function stamp(int $id): Response|BinaryFileResponse
    {
        return $this->serveImage($id, 'stamp_image_path');
    }

    private function serveImage(int $id, string $column): Response|BinaryFileResponse
    {
        $this->checkPermission('inspections.view');

        $signature = Signature::findOrFail($id);
        $relative = $signature->{$column};
        if (! $relative) {
            abort(404, 'Image path missing on signature');
        }

        $path = Storage::disk('local')->path($relative);
        if (! file_exists($path)) {
            abort(404, 'Signature image missing on disk');
        }

        return response()->file($path, [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    private function findSignable(string $shortName, int $id): Model
    {
        $class = self::SIGNABLE_MAP[$shortName] ?? null;
        if (! $class) {
            abort(400, "Unknown signable type: {$shortName}");
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
