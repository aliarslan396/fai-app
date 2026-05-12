<?php

namespace App\Services;

use App\Models\TenantUser;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use PragmaRX\Google2FA\Google2FA;

/**
 * TOTP MFA helpers — generate secret, build otpauth URI, render QR, verify codes.
 */
class MfaService
{
    private Google2FA $g2fa;
    private string $issuer;

    public function __construct()
    {
        $this->g2fa = new Google2FA();
        $this->issuer = config('app.name', 'FAI');
    }

    public function generateSecret(): string
    {
        return $this->g2fa->generateSecretKey(32);
    }

    public function otpauthUri(TenantUser $user, string $secret): string
    {
        $label = $this->issuer . ':' . $user->email;
        $tenant = function_exists('tenant') && tenant() ? tenant()->name : $this->issuer;

        return $this->g2fa->getQRCodeUrl(
            $this->issuer . ' (' . $tenant . ')',
            $user->email,
            $secret
        );
    }

    public function renderQrSvg(string $uri, int $size = 256): string
    {
        $renderer = new ImageRenderer(
            new RendererStyle($size, 1),
            new SvgImageBackEnd()
        );
        $writer = new Writer($renderer);
        return $writer->writeString($uri);
    }

    /**
     * Verify a 6-digit TOTP code against a secret.
     * Returns true if valid (within ±1 time window for clock skew).
     */
    public function verify(string $secret, string $code): bool
    {
        $code = preg_replace('/\s+/', '', $code);
        if (! preg_match('/^\d{6}$/', $code)) {
            return false;
        }

        return $this->g2fa->verifyKey($secret, $code, 1);
    }
}
