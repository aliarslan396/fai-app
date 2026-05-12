<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Central audit log — tracks master-level actions only.
 * Lives in the central database.
 */
class CentralAuditLog extends Model
{
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
