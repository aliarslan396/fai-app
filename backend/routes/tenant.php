<?php

declare(strict_types=1);

use App\Http\Controllers\Tenant\AuditLogController;
use App\Http\Controllers\Tenant\BalloonController;
use App\Http\Controllers\Tenant\CharacteristicController;
use App\Http\Controllers\Tenant\ExportController;
use App\Http\Controllers\Tenant\GaugeController;
use App\Http\Controllers\Tenant\SignatureController;
use App\Http\Controllers\Tenant\CustomerController;
use App\Http\Controllers\Tenant\CustomReportController;
use App\Http\Controllers\Tenant\DashboardController;
use App\Http\Controllers\Tenant\DrawingController;
use App\Http\Controllers\Tenant\FaiForm1Controller;
use App\Http\Controllers\Tenant\FaiForm2Controller;
use App\Http\Controllers\Tenant\FaiForm3Controller;
use App\Http\Controllers\Tenant\InspectionPlanController;
use App\Http\Controllers\Tenant\InspectionSessionController;
use App\Http\Controllers\Tenant\NcrController;
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
                Route::patch('me', [TenantAuthController::class, 'updateMe']);
                Route::post('mfa/setup', [TenantAuthController::class, 'setupMfa']);
                Route::post('mfa/confirm', [TenantAuthController::class, 'confirmMfa']);
                Route::post('mfa/disable', [TenantAuthController::class, 'disableMfa']);
            });

            Route::get('health', fn () => ['status' => 'ok', 'tenant' => tenant('id')]);

            // Dashboard KPIs + recent activity
            Route::get('dashboard', [DashboardController::class, 'index']);

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

            // Inspection Plans (per doc Module 3.2 / 4.2)
            Route::prefix('plans')->group(function () {
                Route::get('/', [InspectionPlanController::class, 'index']);
                Route::post('/', [InspectionPlanController::class, 'store']);
                Route::get('{id}', [InspectionPlanController::class, 'show']);
                Route::patch('{id}', [InspectionPlanController::class, 'update']);
                Route::delete('{id}', [InspectionPlanController::class, 'destroy']);

                // Plan lifecycle (doc 3.1: Draft → Active → Superseded)
                Route::post('{id}/publish', [InspectionPlanController::class, 'publish']);
                Route::post('{id}/retire', [InspectionPlanController::class, 'retire']);

                // Balloons under a plan
                Route::get('{id}/balloons', [BalloonController::class, 'index']);
                Route::post('{id}/balloons', [BalloonController::class, 'store']);
                Route::patch('{id}/balloons/{balloon_id}', [BalloonController::class, 'update']);
                Route::delete('{id}/balloons/{balloon_id}', [BalloonController::class, 'destroy']);
                Route::post('{id}/renumber', [BalloonController::class, 'renumberAll']);

                // AI auto-detect (Ollama-backed)
                Route::get('{id}/drawings/{drawing_id}/pages/{page}/auto-detect',
                    [BalloonController::class, 'autoDetect']);
                Route::post('{id}/balloons/bulk-accept',
                    [BalloonController::class, 'bulkAccept']);

                // Characteristic saved per balloon
                Route::post('{id}/balloons/{balloon_id}/characteristic', [CharacteristicController::class, 'save']);
            });

            // Live requirement-string preview (not tied to a plan)
            Route::post('plans/preview', [CharacteristicController::class, 'preview']);

            // Inspection Sessions — 6-step workflow (Module 4.3)
            Route::prefix('workflow/sessions')->group(function () {
                Route::get('/', [InspectionSessionController::class, 'index']);
                Route::post('/', [InspectionSessionController::class, 'store']);
                Route::get('{id}', [InspectionSessionController::class, 'show']);
                Route::post('{id}/step3', [InspectionSessionController::class, 'step3']);
                Route::delete('{id}', [InspectionSessionController::class, 'destroy']);
            });

            // AS9102 Forms 1/2/3 (Module 4.4)
            Route::prefix('fai')->group(function () {
                // Auto-create or fetch the FAI record for a session at Step 4
                Route::post('session/{session_id}/ensure', [FaiForm1Controller::class, 'ensureForSession']);

                // Form 1
                Route::get('{id}', [FaiForm1Controller::class, 'show']);
                Route::patch('{id}', [FaiForm1Controller::class, 'update']);
                Route::post('{id}/sync-from-balloons', [FaiForm1Controller::class, 'syncFromBalloons']);

                // Form 1 status lifecycle (doc 3.4: In Work → Submitted → Returned → Accepted)
                Route::post('{id}/submit', [FaiForm1Controller::class, 'submit']);
                Route::post('{id}/return', [FaiForm1Controller::class, 'returnForRework']);
                Route::post('{id}/reopen', [FaiForm1Controller::class, 'reopen']);

                // Form 1 Assembly Index rows
                Route::post('{id}/index', [FaiForm1Controller::class, 'storeIndexRow']);
                Route::delete('{id}/index/{row_id}', [FaiForm1Controller::class, 'destroyIndexRow']);

                // Form 2
                Route::get('{id}/form2', [FaiForm2Controller::class, 'show']);
                Route::patch('{id}/form2', [FaiForm2Controller::class, 'update']);
                Route::post('{id}/form2/materials', [FaiForm2Controller::class, 'storeMaterial']);
                Route::patch('{id}/form2/materials/{row_id}', [FaiForm2Controller::class, 'updateMaterial']);
                Route::delete('{id}/form2/materials/{row_id}', [FaiForm2Controller::class, 'destroyMaterial']);

                // Form 3
                Route::get('{id}/form3', [FaiForm3Controller::class, 'index']);
                Route::patch('{id}/form3/rows/{row_id}', [FaiForm3Controller::class, 'updateRow']);
                Route::post('form3/preview', [FaiForm3Controller::class, 'previewResult']);
            });

            // DEF-QA-003 Custom Inspection Report (Module 4.5)
            Route::prefix('custom-reports')->group(function () {
                Route::post('session/{session_id}/ensure', [CustomReportController::class, 'ensureForSession']);
                Route::get('{id}', [CustomReportController::class, 'show']);
                Route::patch('{id}', [CustomReportController::class, 'update']);
                Route::patch('{id}/rows/{row_id}', [CustomReportController::class, 'updateRow']);
                Route::post('{id}/sync-from-plan', [CustomReportController::class, 'syncFromPlan']);
                Route::post('{id}/import-from-fai', [CustomReportController::class, 'importFromFai']);
            });

            // Signatures (Module 4.6 — Week 13)
            Route::prefix('signatures')->group(function () {
                Route::get('/', [SignatureController::class, 'index']);
                Route::middleware('throttle:5,1')->post('/', [SignatureController::class, 'store']);
                Route::get('{id}/image', [SignatureController::class, 'image']);
                Route::get('{id}/stamp', [SignatureController::class, 'stamp']);
            });

            // Gauge Management (Module 3.11 — Week 15). Cal history + status auto-computed.
            Route::prefix('gauges')->group(function () {
                Route::get('/', [GaugeController::class, 'index']);
                Route::post('/', [GaugeController::class, 'store']);
                Route::get('{id}', [GaugeController::class, 'show']);
                Route::patch('{id}', [GaugeController::class, 'update']);
                Route::delete('{id}', [GaugeController::class, 'destroy']);
                Route::post('{id}/calibrations', [GaugeController::class, 'recordCalibration']);
                Route::get('calibrations/{calibrationId}/cert', [GaugeController::class, 'certFile']);
            });

            // NCR (Module 6 — Week 15). Auto-numbered NCR-YYYY-NNNN.
            Route::prefix('ncrs')->group(function () {
                Route::get('/', [NcrController::class, 'index']);
                Route::post('/', [NcrController::class, 'store']);
                Route::get('{id}', [NcrController::class, 'show']);
                Route::patch('{id}', [NcrController::class, 'update']);
                Route::post('{id}/disposition', [NcrController::class, 'disposition']);
                Route::post('{id}/close', [NcrController::class, 'close']);

                // Attachments (doc 3.10)
                Route::post('{id}/attachments', [NcrController::class, 'uploadAttachment']);
                Route::get('{id}/attachments/{attachmentId}', [NcrController::class, 'attachmentFile']);
                Route::delete('{id}/attachments/{attachmentId}', [NcrController::class, 'deleteAttachment']);
            });

            // Exports (Module 5 — Week 14). Bodies stubbed until Day 2-5.
            Route::prefix('exports')->group(function () {
                Route::get('as9102-excel/{formId}', [ExportController::class, 'as9102Excel']);
                Route::get('as9102-pdf/{formId}', [ExportController::class, 'as9102Pdf']);
                Route::get('custom-report-pdf/{reportId}', [ExportController::class, 'customReportPdf']);
            });

            // Drawings — upload + view + delete
            Route::prefix('drawings')->group(function () {
                Route::get('/', [DrawingController::class, 'index']);
                Route::post('/', [DrawingController::class, 'store']);
                Route::get('{id}', [DrawingController::class, 'show']);
                Route::delete('{id}', [DrawingController::class, 'destroy']);
                Route::post('{id}/retry', [DrawingController::class, 'retry']);
                Route::get('{id}/download', [DrawingController::class, 'download']);
                Route::get('{id}/pages/{page}/image', [DrawingController::class, 'pageImage']);
                Route::get('{id}/pages/{page}/thumbnail', [DrawingController::class, 'pageThumbnail']);
                Route::get('{id}/pages/{page}/ocr', [DrawingController::class, 'pageOcr']);
                Route::post('{id}/pages/{page}/re-ocr', [DrawingController::class, 'reOcrPage']);
            });
        });
    });
