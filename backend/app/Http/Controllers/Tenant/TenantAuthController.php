<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PasswordResetCode;
use App\Models\TenantUser;
use App\Services\MfaService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Tenant employee authentication.
 * Runs inside tenant context — queries tenant database.
 */
class TenantAuthController extends Controller
{
    private const DUMMY_HASH = '$2y$12$jQbQxYiPKDztWrc8js1Cx.ODVKvdsW.8S/Nn9RLBweF8ZVgBaXvWu';
    private const MAX_FAILED_ATTEMPTS = 5;
    private const LOCKOUT_MINUTES = 30;

    public function __construct(private MfaService $mfa) {}

    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = TenantUser::where('email', $request->email)->first();

        $passwordCorrect = Hash::check(
            $request->password,
            $user?->password ?? self::DUMMY_HASH
        );

        if (!$user || !$passwordCorrect) {
            if ($user) {
                $user->increment('failed_login_attempts');

                if ($user->failed_login_attempts >= self::MAX_FAILED_ATTEMPTS) {
                    $user->update([
                        'locked_until' => Carbon::now()->addMinutes(self::LOCKOUT_MINUTES),
                    ]);

                    AuditLog::record('login.locked', [
                        'user_id' => $user->id,
                        'meta' => ['email' => $user->email],
                    ]);
                }
            }

            AuditLog::record('login.failed', [
                'meta' => ['email' => $request->email],
            ]);

            throw ValidationException::withMessages([
                'email' => ['Invalid credentials.'],
            ]);
        }

        if ($user->isLocked()) {
            throw ValidationException::withMessages([
                'email' => ['Account locked. Try again ' . $user->locked_until->diffForHumans() . '.'],
            ]);
        }

        if (!$user->isActive()) {
            throw ValidationException::withMessages([
                'email' => ['Account is ' . $user->status . '.'],
            ]);
        }

        $user->update([
            'failed_login_attempts' => 0,
            'locked_until' => null,
            'last_login_at' => now(),
            'last_login_ip' => $request->ip(),
        ]);

        AuditLog::record('login.success', ['user_id' => $user->id]);

        if ($user->hasMfaEnabled()) {
            $challengeToken = $user->createToken('mfa-challenge', ['mfa-pending'])->plainTextToken;
            return response()->json([
                'mfa_required' => true,
                'challenge_token' => $challengeToken,
            ]);
        }

        $token = $user->createToken('tenant-api-token')->plainTextToken;
        $tenant = tenant();

        $userArr = $user->load('roles')->toArray();
        $userArr['permissions'] = $user->getAllPermissions()->map(fn ($p) => ['name' => $p->name])->values();

        return response()->json([
            'token' => $token,
            'user' => $userArr,
            'tenant' => [
                'id' => $tenant->getTenantKey(),
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'logo_url' => $tenant->logo_url,
                'primary_color' => $tenant->primary_color,
                'status' => $tenant->status,
            ],
            'context' => 'tenant',
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        AuditLog::record('logout', ['user_id' => $request->user()->id]);
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        $tenant = tenant();
        $user = $request->user();

        $userArr = $user->load('roles')->toArray();
        $userArr['permissions'] = $user->getAllPermissions()->map(fn ($p) => ['name' => $p->name])->values();

        return response()->json([
            'user' => $userArr,
            'tenant' => [
                'id' => $tenant->getTenantKey(),
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'logo_url' => $tenant->logo_url,
                'primary_color' => $tenant->primary_color,
                'status' => $tenant->status,
            ],
            'context' => 'tenant',
        ]);
    }

    /**
     * Step 1 of password reset — issue a 6-digit code and send it via email.
     * Always returns success to prevent user enumeration.
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => 'required|email']);

        $user = TenantUser::where('email', $request->email)->first();

        if ($user && $user->isActive()) {
            // Invalidate any existing codes for this email
            PasswordResetCode::where('email', $user->email)
                ->whereNull('used_at')
                ->update(['used_at' => now()]);

            $code = (string) random_int(100000, 999999);

            PasswordResetCode::create([
                'email' => $user->email,
                'phone' => $user->phone,
                'code' => $code,
                'attempts' => 0,
                'expires_at' => now()->addMinutes(15),
            ]);

            // Send via Laravel mail (driver=log in dev; check storage/logs/laravel.log)
            try {
                Mail::raw(
                    "Your FAI password reset code is: {$code}\n\nThis code expires in 15 minutes.\nIf you did not request this, ignore this email.",
                    function ($m) use ($user) {
                        $m->to($user->email)
                            ->subject('FAI — Password reset code');
                    }
                );
            } catch (\Throwable $e) {
                Log::error('Password reset mail failed', ['error' => $e->getMessage()]);
            }

            // Also log code in dev mode for testing without real mail
            Log::info("Password reset code for {$user->email}: {$code}");

            AuditLog::record('password.reset.requested', [
                'user_id' => $user->id,
                'meta' => ['email' => $user->email],
            ]);
        }

        return response()->json([
            'message' => 'If that email is registered, a reset code has been sent.',
        ]);
    }

    /**
     * Step 2 — verify code + set new password.
     */
    public function resetPassword(Request $request): JsonResponse
    {
        Validator::make($request->all(), [
            'email' => 'required|email',
            'code' => 'required|string|size:6',
            'password' => 'required|string|min:8|confirmed',
        ])->validate();

        $resetCode = PasswordResetCode::where('email', $request->email)
            ->where('code', $request->code)
            ->whereNull('used_at')
            ->orderByDesc('id')
            ->first();

        if (! $resetCode) {
            // Increment attempts on most recent unused code for this email (rate limit)
            $latest = PasswordResetCode::where('email', $request->email)
                ->whereNull('used_at')
                ->orderByDesc('id')
                ->first();
            if ($latest) {
                $latest->increment('attempts');
            }

            throw ValidationException::withMessages([
                'code' => ['Invalid or expired code.'],
            ]);
        }

        if (! $resetCode->isValid()) {
            throw ValidationException::withMessages([
                'code' => ['This code has expired or has been used too many times. Request a new one.'],
            ]);
        }

        $user = TenantUser::where('email', $request->email)->first();

        if (! $user || ! $user->isActive()) {
            throw ValidationException::withMessages([
                'email' => ['Account not found or inactive.'],
            ]);
        }

        $user->update([
            'password' => Hash::make($request->password),
            'failed_login_attempts' => 0,
            'locked_until' => null,
        ]);

        $resetCode->update(['used_at' => now()]);

        // Revoke all existing tokens — force fresh login everywhere
        $user->tokens()->delete();

        AuditLog::record('password.reset.completed', [
            'user_id' => $user->id,
        ]);

        return response()->json([
            'message' => 'Password reset successful. Please sign in with your new password.',
        ]);
    }

    /**
     * Step 2 of MFA login — verify TOTP code with the challenge token from step 1.
     */
    public function verifyMfa(Request $request): JsonResponse
    {
        $request->validate([
            'code' => 'required|string',
        ]);

        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        $accessToken = $user->currentAccessToken();
        $abilities = $accessToken?->abilities ?? [];

        if (! in_array('mfa-pending', $abilities)) {
            throw ValidationException::withMessages([
                'code' => ['No active MFA challenge for this session.'],
            ]);
        }

        if (! $user->two_factor_secret) {
            throw ValidationException::withMessages([
                'code' => ['MFA is not configured for this account.'],
            ]);
        }

        if (! $this->mfa->verify(decrypt($user->two_factor_secret), $request->code)) {
            AuditLog::record('mfa.verify.failed', ['user_id' => $user->id]);
            throw ValidationException::withMessages([
                'code' => ['Invalid or expired code.'],
            ]);
        }

        // Revoke challenge token, issue full token
        $accessToken->delete();
        $newToken = $user->createToken('tenant-api-token')->plainTextToken;

        AuditLog::record('mfa.verify.success', ['user_id' => $user->id]);

        $tenant = tenant();
        $userArr = $user->load('roles')->toArray();
        $userArr['permissions'] = $user->getAllPermissions()
            ->map(fn ($p) => ['name' => $p->name])->values();

        return response()->json([
            'token' => $newToken,
            'user' => $userArr,
            'tenant' => [
                'id' => $tenant->getTenantKey(),
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'logo_url' => $tenant->logo_url,
                'primary_color' => $tenant->primary_color,
                'status' => $tenant->status,
            ],
            'context' => 'tenant',
        ]);
    }

    /**
     * Begin MFA setup — generates a fresh secret + QR code.
     * Secret is NOT activated until confirmMfa() is called with a valid code.
     */
    public function setupMfa(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->hasMfaEnabled()) {
            throw ValidationException::withMessages([
                'mfa' => ['MFA is already enabled. Disable it first to re-configure.'],
            ]);
        }

        $secret = $this->mfa->generateSecret();

        // Store encrypted secret but mark as NOT confirmed yet
        $user->update([
            'two_factor_secret' => encrypt($secret),
            'two_factor_confirmed_at' => null,
            'two_factor_enabled' => false,
        ]);

        $uri = $this->mfa->otpauthUri($user, $secret);
        $qrSvg = $this->mfa->renderQrSvg($uri);

        return response()->json([
            'secret' => $secret,
            'otpauth_uri' => $uri,
            'qr_code_svg' => $qrSvg,
        ]);
    }

    /**
     * Activate MFA — verify a code against the pending secret.
     */
    public function confirmMfa(Request $request): JsonResponse
    {
        $request->validate([
            'code' => 'required|string',
        ]);

        $user = $request->user();

        if (! $user->two_factor_secret) {
            throw ValidationException::withMessages([
                'code' => ['No MFA setup in progress. Start setup first.'],
            ]);
        }

        if ($user->hasMfaEnabled()) {
            throw ValidationException::withMessages([
                'code' => ['MFA is already enabled.'],
            ]);
        }

        $secret = decrypt($user->two_factor_secret);

        if (! $this->mfa->verify($secret, $request->code)) {
            AuditLog::record('mfa.confirm.failed', ['user_id' => $user->id]);
            throw ValidationException::withMessages([
                'code' => ['Invalid code. Try the next code from your authenticator app.'],
            ]);
        }

        $user->update([
            'two_factor_confirmed_at' => now(),
            'two_factor_enabled' => true,
        ]);

        AuditLog::record('mfa.enabled', ['user_id' => $user->id]);

        return response()->json([
            'message' => 'Two-factor authentication is now enabled.',
            'enabled' => true,
        ]);
    }

    /**
     * Disable MFA — requires current password AND a valid TOTP code.
     */
    public function disableMfa(Request $request): JsonResponse
    {
        $request->validate([
            'password' => 'required|string',
            'code' => 'required|string',
        ]);

        $user = $request->user();

        if (! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'password' => ['Incorrect password.'],
            ]);
        }

        if (! $user->two_factor_secret) {
            throw ValidationException::withMessages([
                'mfa' => ['MFA is not enabled.'],
            ]);
        }

        if (! $this->mfa->verify(decrypt($user->two_factor_secret), $request->code)) {
            throw ValidationException::withMessages([
                'code' => ['Invalid code.'],
            ]);
        }

        $user->update([
            'two_factor_secret' => null,
            'two_factor_confirmed_at' => null,
            'two_factor_enabled' => false,
        ]);

        AuditLog::record('mfa.disabled', ['user_id' => $user->id]);

        return response()->json([
            'message' => 'Two-factor authentication disabled.',
            'enabled' => false,
        ]);
    }
}
