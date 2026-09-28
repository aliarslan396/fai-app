<?php

namespace App\Models;

use App\Models\Concerns\TracksPasswordHistory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

/**
 * Tenant employee user.
 * Lives inside a TENANT database (one DB per company).
 * Has roles: admin, qa_manager, qa_inspector, shop_floor, viewer.
 *
 * For master super admins, see App\Models\User.
 */
class TenantUser extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes, HasRoles, TracksPasswordHistory;

    protected $table = 'users';

    protected string $guard_name = 'web';

    protected $fillable = [
        'name',
        'email',
        'phone',
        'password',
        'password_changed_at',
        'status',
        'two_factor_secret',
        'two_factor_recovery_codes',
        'two_factor_confirmed_at',
        'two_factor_enabled',
        'last_login_at',
        'last_login_ip',
        'failed_login_attempts',
        'locked_until',
        'cert_number',
        'signature_role_title',
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

    public static function passwordHistoryModel(): string
    {
        return PasswordHistory::class;
    }

    /**
     * Only the roles named in password_policy.rotation_roles rotate.
     * Forcing every shop-floor account to change quarterly generates
     * helpdesk load and pushes people toward weaker incrementing
     * passwords without materially reducing risk.
     */
    protected function isSubjectToRotation(): bool
    {
        return $this->hasAnyRole(config('password_policy.rotation_roles'));
    }

    public function trustedDevices()
    {
        return $this->hasMany(TrustedDevice::class, 'user_id');
    }

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
}
