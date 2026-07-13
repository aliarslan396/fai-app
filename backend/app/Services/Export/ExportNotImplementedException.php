<?php

namespace App\Services\Export;

use RuntimeException;

/**
 * Thrown by ExportService method stubs whose bodies haven't landed yet.
 * ExportController catches this specifically and returns HTTP 501 —
 * distinct from ModelNotFoundException (404) or any other runtime error
 * (bubbles to 500).
 */
class ExportNotImplementedException extends RuntimeException
{
}
