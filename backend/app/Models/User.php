<?php

namespace App\Models;

use App\Models\Concerns\TracksPasswordHistory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Master super admin user.
 * Lives in the CENTRAL database only.
 * Manages all tenants, billing, system-wide settings.
 *
 * For tenant employees, see App\Models\TenantUser.
 */
class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes, TracksPasswordHistory;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'password',
        'password_changed_at',
        'status',
        'master_role',
        'two_factor_secret',
        'two_factor_recovery_codes',
        'two_factor_confirmed_at',
        'two_factor_enabled',
        'last_login_at',
        'last_login_ip',
        'failed_login_attempts',
        'locked_until',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'two_factor_secret',
        'two_factor_recovery_codes',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'two_factor_confirmed_at' => 'datetime',
        'last_login_at' => 'datetime',
        'locked_until' => 'datetime',
        'password_changed_at' => 'datetime',
        'two_factor_enabled' => 'boolean',
        'password' => 'hashed',
    ];

    public function isLocked(): bool
    {
        return $this->locked_until && $this->locked_until->isFuture();
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function hasMfaEnabled(): bool
    {
        return $this->two_factor_enabled && $this->two_factor_confirmed_at !== null;
    }

    public function isSuperAdmin(): bool
    {
        return $this->master_role === 'super_admin';
    }

    public static function passwordHistoryModel(): string
    {
        return CentralPasswordHistory::class;
    }

    /**
     * Every central account is privileged — this table only holds master
     * admins, who can provision, suspend and purge any tenant — so all of
     * them rotate rather than only a named subset.
     */
    protected function isSubjectToRotation(): bool
    {
        return true;
    }
}
