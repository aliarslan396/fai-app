<?php

namespace App\Services;

use App\Models\TenantUser;
use Carbon\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Auto-generates a digital QA stamp PNG for an inspector at sign time.
 * Per AS9102: stamp must show inspector name + cert # + role + date.
 *
 * Uses PHP GD built-in bitmap font (no TTF dependency). When DejaVu
 * font lands in the Docker image (for PDF export GD&T glyphs in Week 14),
 * this can be upgraded to imagettftext() for a sharper look.
 */
class StampGenerator
{
    private const STAMP_W = 400;
    private const STAMP_H = 110;

    /**
     * Build a stamp PNG for the given user. Returns the storage-relative
     * path (e.g. "signatures/stamp_abc123.png") suitable for
     * Storage::disk('local')->path() consumption later.
     */
    public function build(TenantUser $user, ?Carbon $when = null): string
    {
        if (! function_exists('imagecreate')) {
            throw new RuntimeException('PHP GD extension required for stamp generation');
        }

        $when ??= now();

        $img = imagecreate(self::STAMP_W, self::STAMP_H);
        if ($img === false) {
            throw new RuntimeException('Failed to allocate stamp image');
        }

        $bg = imagecolorallocate($img, 255, 255, 255);
        $fg = imagecolorallocate($img, 20, 20, 20);
        $accent = imagecolorallocate($img, 180, 30, 30);

        // Outer border
        imagerectangle($img, 0, 0, self::STAMP_W - 1, self::STAMP_H - 1, $fg);
        imagerectangle($img, 2, 2, self::STAMP_W - 3, self::STAMP_H - 3, $fg);

        // Header bar
        imagefilledrectangle($img, 4, 4, self::STAMP_W - 5, 22, $accent);
        $headerText = 'INSPECTED';
        $headerLen = imagefontwidth(4) * strlen($headerText);
        $headerX = (int) ((self::STAMP_W - $headerLen) / 2);
        imagestring($img, 4, $headerX, 6, $headerText, imagecolorallocate($img, 255, 255, 255));

        // Body: name / title / cert / date
        $lines = [
            strtoupper($user->name),
            strtoupper($user->signature_role_title ?? $this->guessTitle($user)),
            'CERT #' . ($user->cert_number ?: 'N/A'),
            $when->format('Y-m-d'),
        ];

        $y = 30;
        foreach ($lines as $i => $line) {
            // Bigger font for name, smaller for rest
            $font = $i === 0 ? 4 : 3;
            imagestring($img, $font, 10, $y, $line, $fg);
            $y += $i === 0 ? 18 : 16;
        }

        $relativePath = 'signatures/stamp_' . Str::uuid() . '.png';
        $absolutePath = Storage::disk('local')->path($relativePath);

        // Ensure directory
        $dir = dirname($absolutePath);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        if (! imagepng($img, $absolutePath)) {
            imagedestroy($img);
            throw new RuntimeException("Failed to write stamp PNG to {$absolutePath}");
        }
        imagedestroy($img);

        return $relativePath;
    }

    private function guessTitle(TenantUser $user): string
    {
        // Fall back to first role name when no signature_role_title set
        $role = $user->getRoleNames()->first();

        return match ($role) {
            'admin' => 'Administrator',
            'qa_manager' => 'QA Manager',
            'qa_inspector' => 'QA Inspector',
            'shop_floor' => 'Shop Floor',
            'viewer' => 'Viewer',
            default => 'Inspector',
        };
    }
}
