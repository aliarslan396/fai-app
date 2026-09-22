<?php

namespace App\Models;

use Stancl\Tenancy\Database\Models\Tenant as BaseTenant;
use Stancl\Tenancy\Contracts\TenantWithDatabase;
use Stancl\Tenancy\Database\Concerns\HasDatabase;
use Stancl\Tenancy\Database\Concerns\HasDomains;

class Tenant extends BaseTenant implements TenantWithDatabase
{
    use HasDatabase, HasDomains;

    public static function getCustomColumns(): array
    {
        return [
            'id',
            'name',
            'slug',
            'subdomain',
            'logo_url',
            'primary_color',
            'status',
            'user_limit',
            'trial_ends_at',
            'stripe_customer_id',
            'stripe_subscription_id',
            'deleted_at',
            'purge_at',
        ];
    }

    protected $casts = [
        'trial_ends_at' => 'datetime',
        'deleted_at' => 'datetime',
        'purge_at' => 'datetime',
        'data' => 'array',
    ];

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isOnTrial(): bool
    {
        return $this->status === 'trial' && $this->trial_ends_at && $this->trial_ends_at->isFuture();
    }

    public function isMarkedForDeletion(): bool
    {
        return $this->status === 'cancelled' && $this->deleted_at !== null;
    }

    /**
     * Days until the tenant DB is purged. Null if not marked for deletion.
     */
    public function daysUntilPurge(): ?int
    {
        if (! $this->purge_at) {
            return null;
        }
        return max(0, (int) now()->diffInDays($this->purge_at, false));
    }
}
