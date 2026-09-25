<?php

namespace App\Models;

use App\Exceptions\ImmutableRecordException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Tenant audit log — runs INSIDE tenant database.
 * No tenant_id column needed — entire DB is one tenant.
 *
 * Append-only by contract (21 CFR Part 11 §11.10(e): audit trails must
 * be "secure, computer-generated, time-stamped" and must not obscure
 * previously recorded information). The boot hooks below make the
 * immutability structural rather than a convention — any UPDATE or
 * DELETE through Eloquent throws instead of silently succeeding.
 */
class AuditLog extends Model
{
    protected static function booted(): void
    {
        static::updating(function (self $log) {
            throw new ImmutableRecordException(
                "Audit log #{$log->id} cannot be modified — audit records are append-only (21 CFR Part 11)."
            );
        });

        static::deleting(function (self $log) {
            throw new ImmutableRecordException(
                "Audit log #{$log->id} cannot be deleted — audit records are append-only (21 CFR Part 11)."
            );
        });
    }

    protected $fillable = [
        'user_id',
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
        return $this->belongsTo(TenantUser::class);
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
