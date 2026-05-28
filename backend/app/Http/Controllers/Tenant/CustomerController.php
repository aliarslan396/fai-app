<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->checkPermission('customers.view');

        $query = Customer::query()
            ->search($request->input('search'));

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($country = $request->input('country')) {
            $query->where('country', $country);
        }

        $sortBy = $request->input('sort_by', 'name');
        $sortDir = $request->input('sort_dir', 'asc');
        if (! in_array($sortBy, ['name', 'code', 'country', 'created_at', 'updated_at'])) {
            $sortBy = 'name';
        }
        if (! in_array($sortDir, ['asc', 'desc'])) {
            $sortDir = 'asc';
        }

        $customers = $query->orderBy($sortBy, $sortDir)
            ->paginate($request->input('per_page', 25));

        return response()->json([
            'data' => $customers->items(),
            'total' => $customers->total(),
            'per_page' => $customers->perPage(),
            'current_page' => $customers->currentPage(),
            'last_page' => $customers->lastPage(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $this->checkPermission('customers.view');

        $customer = Customer::with('creator:id,name,email')->findOrFail($id);

        return response()->json(['customer' => $customer]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->checkPermission('customers.create');

        $data = $request->validate([
            'name' => 'required|string|min:2|max:255',
            'code' => 'nullable|string|max:50',
            'contact_name' => 'nullable|string|max:255',
            'contact_email' => 'nullable|email|max:255',
            'contact_phone' => 'nullable|string|max:30',
            'address' => 'nullable|string|max:1000',
            'country' => 'nullable|string|max:100',
            'notes' => 'nullable|string|max:2000',
            'status' => 'sometimes|in:active,inactive',
        ]);

        $data['created_by'] = $request->user()->id;
        $customer = Customer::create($data);

        AuditLog::record('customer.created', [
            'subject_type' => Customer::class,
            'subject_id' => $customer->id,
            'new_values' => $customer->only(['name', 'code', 'country', 'status']),
        ]);

        return response()->json(['customer' => $customer], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->checkPermission('customers.edit');

        $customer = Customer::findOrFail($id);

        $data = $request->validate([
            'name' => 'sometimes|string|min:2|max:255',
            'code' => 'nullable|string|max:50',
            'contact_name' => 'nullable|string|max:255',
            'contact_email' => 'nullable|email|max:255',
            'contact_phone' => 'nullable|string|max:30',
            'address' => 'nullable|string|max:1000',
            'country' => 'nullable|string|max:100',
            'notes' => 'nullable|string|max:2000',
            'status' => 'sometimes|in:active,inactive',
        ]);

        $oldValues = $customer->only(array_keys($data));
        $customer->update($data);

        AuditLog::record('customer.updated', [
            'subject_type' => Customer::class,
            'subject_id' => $customer->id,
            'old_values' => $oldValues,
            'new_values' => $customer->only(array_keys($data)),
        ]);

        return response()->json(['customer' => $customer]);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->checkPermission('customers.delete');

        $customer = Customer::findOrFail($id);

        // Block delete if referenced by parts (soft check)
        if ($customer->parts()->exists()) {
            return response()->json([
                'message' => 'Cannot delete: customer is linked to ' . $customer->parts()->count() . ' part(s). Reassign or delete those first.',
            ], 409);
        }

        $snapshot = $customer->only(['name', 'code', 'country']);
        $customer->delete();

        AuditLog::record('customer.deleted', [
            'subject_type' => Customer::class,
            'subject_id' => $id,
            'old_values' => $snapshot,
        ]);

        return response()->json(['message' => 'Customer deleted']);
    }

    public function bulkAction(Request $request): JsonResponse
    {
        $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer',
            'action' => 'required|in:activate,deactivate,delete',
        ]);

        $action = $request->input('action');
        $ids = $request->input('ids');

        $required = $action === 'delete' ? 'customers.delete' : 'customers.edit';
        $this->checkPermission($required);

        $customers = Customer::whereIn('id', $ids)->get();
        $count = 0;
        $failed = [];

        foreach ($customers as $customer) {
            try {
                if ($action === 'delete' && $customer->parts()->exists()) {
                    $failed[] = ['id' => $customer->id, 'name' => $customer->name, 'error' => 'linked to parts'];

                    continue;
                }

                match ($action) {
                    'activate' => $customer->update(['status' => 'active']),
                    'deactivate' => $customer->update(['status' => 'inactive']),
                    'delete' => $customer->delete(),
                };
                $count++;
            } catch (\Throwable $e) {
                $failed[] = ['id' => $customer->id, 'name' => $customer->name, 'error' => $e->getMessage()];
            }
        }

        $message = "{$count} customers {$action}d";
        if (! empty($failed)) {
            $message .= ', ' . count($failed) . ' failed';
        }

        return response()->json([
            'message' => $message,
            'processed' => $count,
            'failed' => $failed,
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
