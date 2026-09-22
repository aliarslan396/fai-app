<?php

namespace App\Mail;

use App\Models\Tenant;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * First-login invite sent to the tenant admin when the master console
 * provisions a new tenant. Includes login URL + one-time password so the
 * admin can sign in without any manual credential handoff.
 */
class TenantAdminInvite extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Tenant $tenant,
        public string $adminName,
        public string $adminEmail,
        public string $adminPassword,
        public string $loginUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "You have been invited to {$this->tenant->name} on FAI Manager",
            to: [$this->adminEmail],
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.tenant-admin-invite',
            with: [
                'tenant' => $this->tenant,
                'adminName' => $this->adminName,
                'adminEmail' => $this->adminEmail,
                'adminPassword' => $this->adminPassword,
                'loginUrl' => $this->loginUrl,
            ],
        );
    }
}
