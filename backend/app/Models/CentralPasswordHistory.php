<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Previous password hashes for central master-admin accounts.
 * Tenant equivalents live in PasswordHistory inside each tenant database.
 */
class CentralPasswordHistory extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'central_password_histories';

    protected $fillable = [
        'user_id',
        'password_hash',
    ];

    protected $hidden = [
        'password_hash',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
