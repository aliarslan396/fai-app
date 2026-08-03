<?php

namespace App\Services;

use App\Models\TenantUser;
use Carbon\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Auto-generates a digital QA inspection stamp PNG per AS9102 spec
 * (doc Section 3.7).
 *
 * Design (fixed by binding spec):
 *   - Circular double-ring, transparent PNG background
 *   - Top arc: "INSPECTED"
 *   - Center: company name + FAI # (if provided) + inspector name + cert #
 *   - Bottom arc: signed date
 *   - Red accent color for rings + INSPECTED banner
 *
 * Uses PHP GD's TrueType text rendering (imagettftext) with the DejaVu
 * font bundled in vendor/mpdf/mpdf/ttfonts — falls back to bitmap font
 * if TTF unavailable.
 *
 * Output: 400x400 transparent PNG saved to storage/app/signatures/.
 */
class StampGenerator
{
    private const CANVAS = 400;
    private const CENTER = 200;
    private const OUTER_R = 195;
    private const INNER_R = 172;
    private const ARC_TEXT_R = 155;

    private const DEJAVU_FONT_PATHS = [
        '/var/www/html/vendor/mpdf/mpdf/ttfonts/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    ];

    /**
     * Build a stamp PNG for the given user. Returns the storage-relative path.
     *
     * @param  TenantUser  $user
     * @param  Carbon|null $when       Timestamp shown on stamp (defaults to now)
     * @param  string|null $faiNumber  Optional FAI or IR number to render in center
     * @param  string|null $companyName Optional company/tenant name for center
     */
    public function build(
        TenantUser $user,
        ?Carbon $when = null,
        ?string $faiNumber = null,
        ?string $companyName = null,
    ): string {
        if (! function_exists('imagecreatetruecolor')) {
            throw new RuntimeException('PHP GD extension required for stamp generation');
        }

        $when ??= now();
        $font = $this->findFont();

        // 400x400 truecolor canvas w/ full alpha channel
        $img = imagecreatetruecolor(self::CANVAS, self::CANVAS);
        if ($img === false) {
            throw new RuntimeException('Failed to allocate stamp image');
        }
        imagealphablending($img, false);
        imagesavealpha($img, true);
        $transparent = imagecolorallocatealpha($img, 0, 0, 0, 127);
        imagefill($img, 0, 0, $transparent);
        imagealphablending($img, true);

        // Colors
        $red = imagecolorallocate($img, 176, 26, 28);
        $black = imagecolorallocate($img, 20, 20, 20);

        // Double concentric rings — outer at OUTER_R, inner at INNER_R
        $this->drawRing($img, self::CENTER, self::CENTER, self::OUTER_R, 4, $red);
        $this->drawRing($img, self::CENTER, self::CENTER, self::INNER_R, 3, $red);

        // Top arc text: INSPECTED — angular range 230-310 (80 deg) keeps letters near-vertical
        $this->drawArcText($img, 'INSPECTED', self::CENTER, self::CENTER, self::ARC_TEXT_R + 20, 230, 310, $font, 15, $red);

        // Center block — 3 lines of text (company / name / cert #)
        $centerLines = array_values(array_filter([
            $companyName ? strtoupper(substr($companyName, 0, 20)) : null,
            $faiNumber ? strtoupper($faiNumber) : null,
            strtoupper($user->name),
            'CERT ' . ($user->cert_number ?: 'N/A'),
        ]));

        $lineSpacing = 22;
        $totalHeight = count($centerLines) * $lineSpacing;
        $startY = self::CENTER - ($totalHeight / 2) + 8;

        foreach ($centerLines as $i => $line) {
            $y = (int) ($startY + $i * $lineSpacing);
            $fontSize = $i === 0 && $companyName ? 12 : 11;
            $this->drawCenteredText($img, $line, self::CENTER, $y, $font, $fontSize, $black);
        }

        // Bottom arc: date — need chars to walk RIGHT-TO-LEFT so they read L-to-R when curling under
        // (going from angle 130 down to 50 places first char at bottom-left, last at bottom-right)
        $dateText = $when->format('d M Y');
        $this->drawArcText($img, $dateText, self::CENTER, self::CENTER, self::ARC_TEXT_R + 20, 130, 50, $font, 13, $red, invert: true);

        // Persist
        $relativePath = 'signatures/stamp_' . Str::uuid() . '.png';
        $absolutePath = Storage::disk('local')->path($relativePath);

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

    /**
     * Draw a ring (annulus) by stroking multiple concentric circles.
     */
    private function drawRing(\GdImage $img, int $cx, int $cy, int $r, int $thickness, int $color): void
    {
        for ($t = 0; $t < $thickness; $t++) {
            imageellipse($img, $cx, $cy, ($r - $t) * 2, ($r - $t) * 2, $color);
        }
    }

    /**
     * Draw text along an arc — one character at a time, rotated tangent to arc.
     * angleStart/angleEnd in degrees (0=right, 90=down, 180=left, 270=up in GD coords).
     * invert=true flips character orientation for bottom arcs (so text reads left-to-right when curving under).
     */
    private function drawArcText(\GdImage $img, string $text, int $cx, int $cy, int $r, float $angleStart, float $angleEnd, string|false $font, int $fontSize, int $color, bool $invert = false): void
    {
        $chars = str_split($text);
        $n = count($chars);
        if ($n === 0) return;

        $totalArc = $angleEnd - $angleStart;
        $step = $n > 1 ? $totalArc / ($n - 1) : 0;

        foreach ($chars as $i => $ch) {
            $deg = $angleStart + $i * $step;
            $rad = deg2rad($deg);
            $x = (int) ($cx + $r * cos($rad));
            $y = (int) ($cy + $r * sin($rad));

            // GD rotation is counter-clockwise. Tangent to circle at angle deg:
            //   - Top arc (invert=false): chars stand vertical, base points toward center
            //   - Bottom arc (invert=true): chars flipped 180° so text reads normally when curling under
            $charRotation = $invert
                ? 90 - $deg              // bottom arc — text upright, reads L→R
                : 270 - $deg;            // top arc — text upright, base toward center

            if ($font && file_exists($font)) {
                imagettftext($img, $fontSize, $charRotation, $x, $y, $color, $font, $ch);
            } else {
                // Bitmap fallback — no rotation, just position along arc
                imagestring($img, 4, $x - 3, $y - 6, $ch, $color);
            }
        }
    }

    /**
     * Draw text centered horizontally at (cx, y).
     */
    private function drawCenteredText(\GdImage $img, string $text, int $cx, int $y, string|false $font, int $fontSize, int $color): void
    {
        if ($font && file_exists($font)) {
            $bbox = imagettfbbox($fontSize, 0, $font, $text);
            $width = $bbox[2] - $bbox[0];
            $x = (int) ($cx - $width / 2);
            imagettftext($img, $fontSize, 0, $x, $y, $color, $font, $text);
        } else {
            $width = imagefontwidth(4) * strlen($text);
            $x = (int) ($cx - $width / 2);
            imagestring($img, 4, $x, $y - 8, $text, $color);
        }
    }

    /**
     * Locate a usable TrueType font — tries DejaVu Bold from bundled mPDF,
     * system fonts, returns false if none available (falls back to GD bitmap).
     */
    private function findFont(): string|false
    {
        foreach (self::DEJAVU_FONT_PATHS as $path) {
            if (file_exists($path)) {
                return $path;
            }
        }
        return false;
    }
}
