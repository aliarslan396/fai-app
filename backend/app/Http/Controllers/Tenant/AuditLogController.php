<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Tenant audit log viewer — paginated activity feed.
 */
class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! $user->hasPermissionTo('users.view')) {
            abort(403, 'Missing permission');
        }

        $query = AuditLog::query()->with('user:id,name,email');

        if ($action = $request->input('action')) {
            $query->where('action', 'ilike', "%{$action}%");
        }

        if ($userId = $request->input('user_id')) {
            $query->where('user_id', $userId);
        }

        if ($from = $request->input('from')) {
            $query->where('created_at', '>=', $from);
        }

        if ($to = $request->input('to')) {
            $query->where('created_at', '<=', $to);
        }

        $logs = $query->orderByDesc('id')
            ->paginate($request->input('per_page', 50));

        return response()->json($logs);
    }
}
