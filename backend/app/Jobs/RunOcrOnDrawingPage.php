<?php

namespace App\Jobs;

use App\Models\DrawingPage;
use App\Models\Tenant;
use App\Services\OcrService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Stancl\Tenancy\Contracts\TenantWithDatabase;

/**
 * Runs Tesseract OCR on a single drawing page image and stores the
 * structured result on drawing_pages.ocr_text. Tenant-scoped: needs to
 * re-initialize tenant context when picked up by the queue worker.
 */
class RunOcrOnDrawingPage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;
    public int $timeout = 300;

    public function __construct(
        public string $tenantId,
        public int $drawingPageId,
    ) {}

    public function handle(OcrService $ocr): void
    {
        $tenant = Tenant::find($this->tenantId);
        if (! $tenant instanceof TenantWithDatabase) {
            Log::warning('OCR job: tenant not found', ['tenant' => $this->tenantId]);
            return;
        }

        $tenant->run(function () use ($ocr) {
            $page = DrawingPage::find($this->drawingPageId);
            if (! $page) {
                Log::warning('OCR job: page not found', ['page' => $this->drawingPageId]);
                return;
            }

            $imagePath = storage_path('app/'.$page->image_path);
            if (! is_readable($imagePath)) {
                Log::error('OCR job: image missing', ['page' => $page->id, 'path' => $imagePath]);
                return;
            }

            try {
                $result = $ocr->processImage($imagePath, [
                    'preprocess' => 'auto',
                    'psm' => 6,
                    'min_confidence' => 0.5,
                ]);

                $page->update([
                    'ocr_text' => $result,
                    'ocr_completed_at' => now(),
                ]);

                Log::info('OCR done', [
                    'page' => $page->id,
                    'blocks' => count($result['blocks'] ?? []),
                    'ms' => $result['processing_ms'] ?? null,
                ]);
            } catch (\Throwable $e) {
                Log::error('OCR job failed', [
                    'page' => $page->id,
                    'error' => $e->getMessage(),
                ]);
                throw $e;
            }
        });
    }
}
