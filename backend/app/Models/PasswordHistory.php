<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Previous password hashes, used to block reuse.
 *
 * Append-only in practice: rows are written on every password change and
 * trimmed to the configured history depth. Nothing reads a hash except
 * the reuse check in PasswordPolicy.
 */
class PasswordHistory extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id',
        'password_hash',
    ];

    protected $hidden = [
        'password_hash',
    ];

    public function user()
    {
        return $this->belongsTo(TenantUser::class, 'user_id');
    }
}
