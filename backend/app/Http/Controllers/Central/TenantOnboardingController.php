<?php

namespace App\Http\Controllers\Central;

use App\Http\Controllers\Controller;
use App\Services\TenantOnboardingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public tenant signup — companies sign up to get their subdomain.
 */
class TenantOnboardingController extends Controller
{
    public function __construct(private TenantOnboardingService $onboarding) {}

    public function signup(Request $request): JsonResponse
    {
        $result = $this->onboarding->signup($request->all());

        return response()->json([
            'message' => 'Tenant created successfully',
            'tenant' => [
                'id' => $result['tenant']->id,
                'name' => $result['tenant']->name,
                'subdomain' => $result['tenant']->subdomain,
                'status' => $result['tenant']->status,
                'trial_ends_at' => $result['tenant']->trial_ends_at,
            ],
            'admin_email' => $result['admin_email'],
            'login_url' => $result['login_url'],
        ], 201);
    }
}
