<?php

declare(strict_types=1);

use App\Http\Controllers\Tenant\AuditLogController;
use App\Http\Controllers\Tenant\CustomerController;
use App\Http\Controllers\Tenant\DrawingController;
use App\Http\Controllers\Tenant\PartController;
use App\Http\Controllers\Tenant\TenantAuthController;
use App\Http\Controllers\Tenant\TenantSettingsController;
use App\Http\Controllers\Tenant\UserController;
use App\Http\Middleware\EnsureTenantActive;
use Illuminate\Support\Facades\Route;
use Stancl\Tenancy\Middleware\InitializeTenancyByDomain;
use Stancl\Tenancy\Middleware\PreventAccessFromCentralDomains;

/*
|--------------------------------------------------------------------------
| Tenant API Routes
|--------------------------------------------------------------------------
*/

Route::prefix('api/v1')
    ->middleware([
        'api',
        InitializeTenancyByDomain::class,
        PreventAccessFromCentralDomains::class,
        EnsureTenantActive::class,
    ])
    ->group(function () {

        // Tenant context info — public, no auth required
        Route::get('tenant/info', function () {
            $t = tenant();
            $trialDaysLeft = null;
            $trialExpired = false;
            if ($t->trial_ends_at) {
                $trialDaysLeft = max(0, now()->diffInDays($t->trial_ends_at, false));
                $trialExpired = $t->trial_ends_at->isPast();
            }

            return response()->json([
                'id' => $t->getTenantKey(),
                'name' => $t->name,
                'slug' => $t->slug,
                'subdomain' => $t->subdomain,
                'logo_url' => $t->logo_url,
                'primary_color' => $t->primary_color,
                'status' => $t->status,
                'trial_ends_at' => $t->trial_ends_at?->toIso8601String(),
                'trial_days_left' => $trialDaysLeft !== null ? (int) ceil($trialDaysLeft) : null,
                'trial_expired' => $trialExpired,
                'user_limit' => $t->user_limit,
            ]);
        })->withoutMiddleware([EnsureTenantActive::class]);

        // Public auth endpoints
        Route::prefix('auth')->group(function () {
            Route::middleware('throttle:10,1')->post('login', [TenantAuthController::class, 'login']);
            Route::middleware('throttle:5,60')->post('forgot-password', [TenantAuthController::class, 'forgotPassword']);
            Route::middleware('throttle:5,60')->post('reset-password', [TenantAuthController::class, 'resetPassword']);
        });

        // MFA verification — requires challenge token (Sanctum token with mfa-pending ability)
        Route::middleware(['auth:sanctum', 'tenant.user'])->post('auth/verify-mfa', [TenantAuthController::class, 'verifyMfa']);

        // Protected
        Route::middleware(['auth:sanctum', 'tenant.user'])->group(function () {
            Route::prefix('auth')->group(function () {
                Route::post('logout', [TenantAuthController::class, 'logout']);
                Route::get('me', [TenantAuthController::class, 'me']);
                Route::post('mfa/setup', [TenantAuthController::class, 'setupMfa']);
                Route::post('mfa/confirm', [TenantAuthController::class, 'confirmMfa']);
                Route::post('mfa/disable', [TenantAuthController::class, 'disableMfa']);
            });

            Route::get('health', fn () => ['status' => 'ok', 'tenant' => tenant('id')]);

            // Tenant settings (admin only via permission)
            Route::prefix('settings')->group(function () {
                Route::get('/', [TenantSettingsController::class, 'show']);
                Route::patch('/', [TenantSettingsController::class, 'update']);
                Route::post('logo', [TenantSettingsController::class, 'uploadLogo']);
                Route::delete('logo', [TenantSettingsController::class, 'removeLogo']);
            });

            // Audit log
            Route::get('audit-logs', [AuditLogController::class, 'index']);

            // User management
            Route::prefix('users')->group(function () {
                Route::get('/', [UserController::class, 'index']);
                Route::post('/', [UserController::class, 'store']);
                Route::post('bulk', [UserController::class, 'bulkAction']);
                Route::get('{id}', [UserController::class, 'show']);
                Route::patch('{id}', [UserController::class, 'update']);
                Route::patch('{id}/disable', [UserController::class, 'disable']);
                Route::patch('{id}/enable', [UserController::class, 'enable']);
                Route::delete('{id}', [UserController::class, 'destroy']);
            });

            // Customers
            Route::prefix('customers')->group(function () {
                Route::get('/', [CustomerController::class, 'index']);
                Route::post('/', [CustomerController::class, 'store']);
                Route::post('bulk', [CustomerController::class, 'bulkAction']);
                Route::get('{id}', [CustomerController::class, 'show']);
                Route::patch('{id}', [CustomerController::class, 'update']);
                Route::delete('{id}', [CustomerController::class, 'destroy']);
            });

            // Parts (minimal CRUD for Week 5 — full module in Week 9)
            Route::prefix('parts')->group(function () {
                Route::get('/', [PartController::class, 'index']);
                Route::post('/', [PartController::class, 'store']);
                Route::get('{id}', [PartController::class, 'show']);
                Route::patch('{id}', [PartController::class, 'update']);
                Route::delete('{id}', [PartController::class, 'destroy']);
            });

            // Drawings — upload + view + delete
            Route::prefix('drawings')->group(function () {
                Route::get('/', [DrawingController::class, 'index']);
                Route::post('/', [DrawingController::class, 'store']);
                Route::get('{id}', [DrawingController::class, 'show']);
                Route::delete('{id}', [DrawingController::class, 'destroy']);
                Route::get('{id}/download', [DrawingController::class, 'download']);
                Route::get('{id}/pages/{page}/image', [DrawingController::class, 'pageImage']);
                Route::get('{id}/pages/{page}/thumbnail', [DrawingController::class, 'pageThumbnail']);
                Route::get('{id}/pages/{page}/ocr', [DrawingController::class, 'pageOcr']);
            });
        });
    });
