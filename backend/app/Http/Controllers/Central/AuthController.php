<?php

namespace App\Http\Controllers\Central;

use App\Http\Controllers\Controller;
use App\Models\CentralAuditLog;
use App\Models\User;
use App\Rules\PasswordPolicy;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Master super admin authentication.
 * Only super admins use this endpoint at the central domain.
 */
class AuthController extends Controller
{
    private const DUMMY_HASH = '$2y$12$jQbQxYiPKDztWrc8js1Cx.ODVKvdsW.8S/Nn9RLBweF8ZVgBaXvWu';
    private const MAX_FAILED_ATTEMPTS = 5;
    private const LOCKOUT_MINUTES = 30;

    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $request->email)->first();

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

                    CentralAuditLog::record('master.login.locked', [
                        'user_id' => $user->id,
                        'meta' => ['email' => $user->email],
                    ]);
                }
            }

            CentralAuditLog::record('master.login.failed', [
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

        CentralAuditLog::record('master.login.success', [
            'user_id' => $user->id,
        ]);

        if ($user->hasMfaEnabled()) {
            $challengeToken = $user->createToken('mfa-challenge', ['mfa-pending'])->plainTextToken;
            return response()->json([
                'mfa_required' => true,
                'challenge_token' => $challengeToken,
            ]);
        }

        $token = $user->createToken('master-api-token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user,
            'context' => 'master',
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        CentralAuditLog::record('master.logout', ['user_id' => $request->user()->id]);
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        $userArr = $user->toArray();
        $userArr['password_expired'] = $user->passwordExpired();
        $userArr['mfa_required'] = (bool) config('session_policy.mfa_required_for_master')
            && ! $user->hasMfaEnabled();

        return response()->json([
            'user' => $userArr,
            // Same shape the tenant endpoint returns, so the frontend
            // password components work on both surfaces unchanged.
            'password_policy' => [
                'min_length' => (int) config('password_policy.min_length'),
                'require_mixed_case' => (bool) config('password_policy.require_mixed_case'),
                'require_numbers' => (bool) config('password_policy.require_numbers'),
                'require_symbols' => (bool) config('password_policy.require_symbols'),
                'requirements' => PasswordPolicy::describe(),
            ],
            'context' => 'master',
        ]);
    }

    /**
     * Change the master admin's own password.
     *
     * This account can provision, suspend and permanently purge every
     * tenant on the platform, and until now there was no way to change
     * its password through the app at all — it kept whatever the seeder
     * gave it. Same policy as tenant users, same reuse history, same
     * rotation window.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $user = $request->user();

        Validator::make($request->all(), [
            'current_password' => 'required|string',
            'password' => ['required', 'string', 'confirmed', new PasswordPolicy($user)],
        ])->validate();

        if (! Hash::check($request->current_password, $user->password)) {
            CentralAuditLog::record('master.password.change.failed', [
                'user_id' => $user->id,
                'meta' => ['reason' => 'current_password_incorrect'],
            ]);

            throw ValidationException::withMessages([
                'current_password' => ['Current password is incorrect.'],
            ]);
        }

        $newHash = Hash::make($request->password);

        $user->update([
            'password' => $newHash,
            'password_changed_at' => now(),
        ]);

        $user->recordPasswordHistory($newHash);

        // Drop every other session; the caller keeps the token they are
        // holding so a rotation does not bounce them to the login screen.
        $currentTokenId = $user->currentAccessToken()?->id;
        $user->tokens()->when($currentTokenId, fn ($q) => $q->where('id', '!=', $currentTokenId))->delete();

        CentralAuditLog::record('master.password.change.completed', [
            'user_id' => $user->id,
        ]);

        return response()->json([
            'message' => 'Password updated.',
            'password_changed_at' => $user->password_changed_at,
        ]);
    }
}
