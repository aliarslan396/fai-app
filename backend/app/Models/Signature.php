<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Polymorphic signature record. Each row binds a user's signature
 * + auto-generated stamp to any signable form (FaiForm1, FaiForm3Row,
 * CustomInspectionReport) at a specific moment.
 *
 * Created exclusively via SignatureService::sign() — never directly
 * by controllers, because the service handles password verification,
 * stamp generation, audit logging, and parent-form locking in one
 * transaction.
 */
class Signature extends Model
{
    use HasFactory;

    public const ROLE_INSPECTOR = 'inspector';
    public const ROLE_QA_MANAGER = 'qa_manager';
    public const ROLE_CUSTOMER_REP = 'customer_rep';

    public const ROLES = [
        self::ROLE_INSPECTOR,
        self::ROLE_QA_MANAGER,
        self::ROLE_CUSTOMER_REP,
    ];

    protected $fillable = [
        'signable_type',
        'signable_id',
        'signature_role',
        'signed_by',
        'signed_at',
        'signature_image_path',
        'stamp_image_path',
        'ip_address',
        'user_agent',
        'password_verified_at',
    ];

    protected $casts = [
        'signed_at' => 'datetime',
        'password_verified_at' => 'datetime',
        'signable_id' => 'integer',
        'signed_by' => 'integer',
    ];

    public function signable(): MorphTo
    {
        return $this->morphTo();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(TenantUser::class, 'signed_by');
    }
}
