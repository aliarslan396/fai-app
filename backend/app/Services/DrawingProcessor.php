<?php

namespace App\Services;

use App\Jobs\RunOcrOnDrawingPage;
use App\Models\Drawing;
use App\Models\DrawingPage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

/**
 * Renders uploaded drawing PDFs/images into per-page PNG previews + thumbnails.
 * Runs synchronously in this phase; will be queued in Phase 2b once OCR/AI added.
 */
class DrawingProcessor
{
    private const RENDER_DPI = 150;
    private const THUMB_WIDTH = 300;

    public function process(Drawing $drawing): void
    {
        $tenantKey = tenant()?->getTenantKey() ?? 'default';
        $relativeDir = "drawings/{$tenantKey}/{$drawing->id}";
        $absoluteDir = storage_path("app/{$relativeDir}");

        if (! is_dir($absoluteDir)) {
            mkdir($absoluteDir, 0755, true);
        }

        try {
            $drawing->update(['status' => 'processing', 'processing_error' => null]);

            $pdfPath = Storage::disk('local')->path($drawing->file_path);

            if (str_starts_with($drawing->mime_type, 'image/')) {
                $this->processImage($drawing, $pdfPath, $absoluteDir, $relativeDir);
            } else {
                $this->processPdf($drawing, $pdfPath, $absoluteDir, $relativeDir);
            }

            $drawing->update([
                'status' => 'processed',
                'processed_at' => now(),
                'page_count' => $drawing->pages()->count(),
            ]);

            // Queue OCR for every page (tenant-scoped, async)
            $tenantId = tenant()?->getTenantKey();
            if ($tenantId) {
                $drawing->pages()->get()->each(function ($page) use ($tenantId) {
                    RunOcrOnDrawingPage::dispatch($tenantId, $page->id);
                });
            }
        } catch (\Throwable $e) {
            Log::error('Drawing processing failed', [
                'drawing_id' => $drawing->id,
                'error' => $e->getMessage(),
            ]);

            $drawing->update([
                'status' => 'failed',
                'processing_error' => substr($e->getMessage(), 0, 1000),
            ]);

            throw $e;
        }
    }

    private function processPdf(Drawing $drawing, string $pdfPath, string $absDir, string $relDir): void
    {
        $pageCount = $this->getPdfPageCount($pdfPath);

        for ($page = 1; $page <= $pageCount; $page++) {
            $pageBase = sprintf('%s/page-%03d', $absDir, $page);
            $imagePath = "{$pageBase}.png";

            // Render page to PNG at fixed DPI
            $proc = new Process([
                'pdftoppm',
                '-r', (string) self::RENDER_DPI,
                '-f', (string) $page,
                '-l', (string) $page,
                '-png',
                $pdfPath,
                $pageBase,
            ]);
            $proc->setTimeout(120);
            $proc->mustRun();

            // pdftoppm output naming is version + page-count dependent:
            //   PDFs with 1-9 pages  -> "{prefix}-1.png"
            //   PDFs with 10-99 pgs  -> "{prefix}-01.png"
            //   PDFs with 100+ pgs   -> "{prefix}-001.png"
            //   Some poppler builds  -> "{prefix}.png" (no suffix, single-page)
            // Glob covers all forms without guessing.
            $renderedPath = null;
            $candidates = glob("{$pageBase}-*.png") ?: [];
            if (empty($candidates) && file_exists("{$pageBase}.png")) {
                $candidates = ["{$pageBase}.png"];
            }
            if (! empty($candidates)) {
                $renderedPath = $candidates[0];
            }
            if ($renderedPath === null || ! file_exists($renderedPath)) {
                $found = array_map('basename', glob("{$absDir}/*") ?: []);
                throw new \RuntimeException(
                    "pdftoppm did not produce expected output for page {$page}. Found files: "
                    . (empty($found) ? '(none)' : implode(', ', $found))
                );
            }
            rename($renderedPath, $imagePath);

            [$width, $height] = getimagesize($imagePath);

            $thumbPath = "{$pageBase}-thumb.png";
            $this->makeThumbnail($imagePath, $thumbPath);

            DrawingPage::create([
                'drawing_id' => $drawing->id,
                'page_number' => $page,
                'image_path' => "{$relDir}/page-" . sprintf('%03d', $page) . '.png',
                'thumbnail_path' => "{$relDir}/page-" . sprintf('%03d', $page) . '-thumb.png',
                'width' => $width,
                'height' => $height,
            ]);
        }
    }

    private function processImage(Drawing $drawing, string $srcPath, string $absDir, string $relDir): void
    {
        $page = 1;
        $imagePath = "{$absDir}/page-001.png";
        $thumbPath = "{$absDir}/page-001-thumb.png";

        // Convert to PNG (always) so storage path is predictable
        $proc = new Process(['convert', $srcPath, $imagePath]);
        $proc->setTimeout(60);
        $proc->mustRun();

        [$width, $height] = getimagesize($imagePath);
        $this->makeThumbnail($imagePath, $thumbPath);

        DrawingPage::create([
            'drawing_id' => $drawing->id,
            'page_number' => $page,
            'image_path' => "{$relDir}/page-001.png",
            'thumbnail_path' => "{$relDir}/page-001-thumb.png",
            'width' => $width,
            'height' => $height,
        ]);
    }

    private function getPdfPageCount(string $pdfPath): int
    {
        $proc = new Process(['pdfinfo', $pdfPath]);
        $proc->setTimeout(30);
        $proc->mustRun();

        if (preg_match('/^Pages:\s+(\d+)/m', $proc->getOutput(), $m)) {
            return (int) $m[1];
        }

        return 1;
    }

    private function makeThumbnail(string $srcImage, string $destImage): void
    {
        $proc = new Process([
            'convert',
            $srcImage,
            '-resize', self::THUMB_WIDTH . 'x',
            '-strip',
            $destImage,
        ]);
        $proc->setTimeout(60);
        $proc->mustRun();
    }
}
