<?php

namespace App\Services;

use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Thin HTTP client for the Python OCR microservice.
 * The OCR container exposes a single POST /process endpoint that takes
 * a page image (PNG/JPG) and returns structured text blocks + bbox.
 */
class OcrService
{
    public function __construct(private HttpFactory $http) {}

    public function isHealthy(): bool
    {
        try {
            $resp = $this->client()->timeout(5)->get('/health');

            return $resp->ok();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Send a page image to the OCR service.
     *
     * @return array{
     *     width:int, height:int, blocks:array<int, array{text:string, bbox:array<int>, confidence:float, block_num:int, line_num:int}>,
     *     raw_text:string, processing_ms:int, preprocess:array
     * }
     */
    public function processImage(string $imagePath, array $options = []): array
    {
        if (! is_readable($imagePath)) {
            throw new RuntimeException("OCR: image not readable: {$imagePath}");
        }

        $fields = [];
        foreach ($options as $key => $value) {
            $fields[] = ['name' => $key, 'contents' => (string) $value];
        }

        try {
            $resp = $this->client()
                ->timeout(180)
                ->attach('file', file_get_contents($imagePath), basename($imagePath))
                ->asMultipart()
                ->post('/process', $options);

            if (! $resp->successful()) {
                throw new RuntimeException(
                    'OCR service error '.$resp->status().': '.substr($resp->body(), 0, 500)
                );
            }

            return $resp->json();
        } catch (\Throwable $e) {
            Log::error('OCR processImage failed', [
                'path' => $imagePath,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * Classify a batch of OCR text snippets via the Ollama-backed classifier.
     *
     * @param  string[]  $texts
     * @return array<int, array<string, mixed>>
     */
    public function classifyBatch(array $texts): array
    {
        if (empty($texts)) {
            return [];
        }

        try {
            $resp = $this->client()
                ->timeout(600)  // llama3.2:3b on CPU can be ~5 sec/snippet
                ->asJson()
                ->post('/classify-batch', ['texts' => array_values($texts)]);

            if (! $resp->successful()) {
                throw new RuntimeException(
                    'OCR classify error '.$resp->status().': '.substr($resp->body(), 0, 500)
                );
            }

            return $resp->json('results') ?? [];
        } catch (\Throwable $e) {
            Log::error('OCR classifyBatch failed', [
                'count' => count($texts),
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    private function client(): PendingRequest
    {
        $base = config('services.ocr.url', env('OCR_SERVICE_URL', 'http://ocr:8001'));

        return $this->http->baseUrl(rtrim($base, '/'));
    }
}
