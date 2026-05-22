<?php

use App\Http\Controllers\Central\AuthController;
use App\Http\Controllers\Central\CentralAuditLogController;
use App\Http\Controllers\Central\TenantController;
use App\Http\Controllers\Central\TenantOnboardingController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| CENTRAL API Routes (Master Domain)
|--------------------------------------------------------------------------
|
| Routes accessible only via the central domain (localhost).
| For tenant-scoped routes, see routes/tenant.php
|
*/

Route::prefix('v1')->group(function () {

    // Public health check
    Route::get('ping', fn () => ['status' => 'ok', 'service' => 'fai-master-api']);

    // Tenant signup (public — companies sign up)
    Route::middleware('throttle:5,60')->post('signup', [TenantOnboardingController::class, 'signup']);

    // Master super admin auth
    Route::prefix('master/auth')->group(function () {
        Route::middleware('throttle:10,1')->post('login', [AuthController::class, 'login']);

        Route::middleware(['auth:sanctum', 'master.user'])->group(function () {
            Route::post('logout', [AuthController::class, 'logout']);
            Route::get('me', [AuthController::class, 'me']);
        });
    });

    // Master super admin protected routes
    Route::middleware(['auth:sanctum', 'master.user'])->prefix('master')->group(function () {
        Route::get('tenants', [TenantController::class, 'index']);
        Route::post('tenants', [TenantController::class, 'store']);
        Route::get('tenants/{id}', [TenantController::class, 'show']);
        Route::patch('tenants/{id}', [TenantController::class, 'update']);
        Route::delete('tenants/{id}', [TenantController::class, 'destroy']);
        Route::patch('tenants/{id}/suspend', [TenantController::class, 'suspend']);
        Route::patch('tenants/{id}/activate', [TenantController::class, 'activate']);
        Route::get('tenants/{id}/activity', [CentralAuditLogController::class, 'tenantActivity']);

        Route::get('activity', [CentralAuditLogController::class, 'index']);
    });
});
