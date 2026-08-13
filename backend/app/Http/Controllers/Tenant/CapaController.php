<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Capa;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * CAPA read endpoints — STUB scope only.
 *
 * Full workflow (5-tab UI, 5-Why analysis, action plan, approval,
 * effectiveness) ships in Sprint 2. This controller exists so the
 * "Escalate to CAPA" button can jump to a real page and inspectors
 * can see the CAPA was created + linked back to the NCR.
 */
class CapaController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('ncr.view');

        $query = Capa::query()
            ->with([
                'sourceNcr:id,ncr_number,status',
                'part:id,part_number,description',
                'creator:id,name',
            ])
            ->orderByDesc('created_at');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($sourceNcr = $request->query('source_ncr_id')) {
            $query->where('source_ncr_id', $sourceNcr);
        }

        return response()->json(['capas' => $query->paginate(50)]);
    }

    public function show(int $id): JsonResponse
    {
        $this->checkPermission('ncr.view');

        $capa = Capa::with([
            'sourceNcr:id,ncr_number,status,defect_code,severity',
            'part:id,part_number,description',
            'creator:id,name,email',
        ])->findOrFail($id);

        return response()->json(['capa' => $capa]);
    }

    private function checkPermission(string $permission): void
    {
        $user = request()->user();
        if (! $user || ! $user->hasPermissionTo($permission)) {
            abort(403, "Missing permission: {$permission}");
        }
    }
}
