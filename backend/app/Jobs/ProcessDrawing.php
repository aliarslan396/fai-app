<?php

namespace App\Jobs;

use App\Models\Drawing;
use App\Models\Tenant;
use App\Services\DrawingProcessor;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Stancl\Tenancy\Contracts\TenantWithDatabase;

/**
 * Rasterizes a drawing PDF/image into per-page PNGs off the request
 * thread so uploads return immediately. The upload handler dispatches
 * this after storing the source file; the frontend polls the drawing
 * status until it flips from 'pending' -> 'processed' | 'failed'.
 */
class ProcessDrawing implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;
    public int $timeout = 600;

    public function __construct(
        public string $tenantId,
        public int $drawingId,
    ) {}

    public function handle(DrawingProcessor $processor): void
    {
        $tenant = Tenant::find($this->tenantId);
        if (! $tenant instanceof TenantWithDatabase) {
            Log::warning('ProcessDrawing: tenant not found', ['tenant' => $this->tenantId]);
            return;
        }

        $tenant->run(function () use ($processor) {
            $drawing = Drawing::find($this->drawingId);
            if (! $drawing) {
                Log::warning('ProcessDrawing: drawing not found', ['id' => $this->drawingId]);
                return;
            }

            try {
                $processor->process($drawing);
            } catch (\Throwable $e) {
                Log::error('ProcessDrawing failed', [
                    'drawing_id' => $drawing->id,
                    'error' => $e->getMessage(),
                ]);
                // Do not rethrow — DrawingProcessor already marks status=failed
                // with the error message on the drawing row. Rethrowing would
                // just retry (tries=1) and log noise.
            }
        });
    }
}
