<?php

namespace App\Models\Concerns;

use Illuminate\Support\Facades\Hash;

/**
 * Password history + rotation, shared by tenant users and central master
 * admins so both surfaces enforce one policy rather than drifting.
 *
 * Each model names its own history table — tenant histories live inside
 * the tenant database, central ones in the central database — but the
 * reuse and expiry logic is identical.
 */
trait TracksPasswordHistory
{
    /**
     * Fully-qualified history model for this user type.
     */
    abstract public static function passwordHistoryModel(): string;

    /**
     * Roles subject to forced rotation. Tenant users check their spatie
     * roles; the central super admin is privileged by definition.
     */
    abstract protected function isSubjectToRotation(): bool;

    public function recordPasswordHistory(string $hash): void
    {
        $depth = (int) config('password_policy.history_count');
        if ($depth < 1) {
            return;
        }

        $model = static::passwordHistoryModel();

        $model::create([
            'user_id' => $this->id,
            'password_hash' => $hash,
            'created_at' => now(),
        ]);

        $keep = $model::where('user_id', $this->id)
            ->orderByDesc('id')
            ->limit($depth)
            ->pluck('id');

        if ($keep->isNotEmpty()) {
            $model::where('user_id', $this->id)->whereNotIn('id', $keep)->delete();
        }
    }

    /**
     * True when the candidate matches the current password or any of the
     * retained previous ones.
     */
    public function hasUsedPassword(string $candidate): bool
    {
        $depth = (int) config('password_policy.history_count');
        if ($depth < 1) {
            return false;
        }

        // The current password counts as reuse even though it is not yet
        // in the history table — otherwise "change" could be a no-op.
        if (! empty($this->password) && Hash::check($candidate, $this->password)) {
            return true;
        }

        $model = static::passwordHistoryModel();

        foreach ($model::where('user_id', $this->id)->orderByDesc('id')->limit($depth)->pluck('password_hash') as $hash) {
            if (Hash::check($candidate, $hash)) {
                return true;
            }
        }

        return false;
    }

    public function passwordExpired(): bool
    {
        $days = (int) config('password_policy.rotation_days');
        if ($days < 1 || ! $this->isSubjectToRotation()) {
            return false;
        }

        // Null means the account predates rotation tracking and the
        // migration backfill did not reach it — treat as due rather than
        // silently exempt.
        if (! $this->password_changed_at) {
            return true;
        }

        return $this->password_changed_at->addDays($days)->isPast();
    }
}
