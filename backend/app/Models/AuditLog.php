<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Tenant audit log — runs INSIDE tenant database.
 * No tenant_id column needed — entire DB is one tenant.
 */
class AuditLog extends Model
{
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
