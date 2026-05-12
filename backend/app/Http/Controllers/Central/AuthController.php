<?php

namespace App\Http\Controllers\Central;

use App\Http\Controllers\Controller;
use App\Models\CentralAuditLog;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
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
        return response()->json([
            'user' => $request->user(),
            'context' => 'master',
        ]);
    }
}
