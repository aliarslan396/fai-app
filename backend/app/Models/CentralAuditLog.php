<?php

namespace App\Models;

use App\Exceptions\ImmutableRecordException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Central audit log — tracks master-level actions only.
 * Lives in the central database.
 *
 * Append-only by contract, same as the tenant-scoped AuditLog. Master
 * ops actions (tenant provision / suspend / purge) are exactly the
 * records an auditor would most want to see tampered with, so the
 * immutability is enforced structurally.
 */
class CentralAuditLog extends Model
{
    protected static function booted(): void
    {
        static::updating(function (self $log) {
            throw new ImmutableRecordException(
                "Central audit log #{$log->id} cannot be modified — audit records are append-only (21 CFR Part 11)."
            );
        });

        static::deleting(function (self $log) {
            throw new ImmutableRecordException(
                "Central audit log #{$log->id} cannot be deleted — audit records are append-only (21 CFR Part 11)."
            );
        });
    }

    protected $table = 'central_audit_logs';

    protected $fillable = [
        'user_id',
        'tenant_id',
        'action',
        'subject_type',
        'subject_id',
        'ip_address',
        'user_agent',
        'old_values',
        'new_values',
        'meta',
    ];

    protected $casts = [
        'old_values' => 'array',
        'new_values' => 'array',
        'meta' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public static function record(string $action, array $data = []): self
    {
        $defaults = [
            'user_id' => Auth::id(),
            'action' => $action,
        ];

        if (app()->bound('request') && request() instanceof \Illuminate\Http\Request) {
            $defaults['ip_address'] = request()->ip();
            $defaults['user_agent'] = request()->userAgent();
        }

        return self::create(array_merge($defaults, $data));
    }
}
