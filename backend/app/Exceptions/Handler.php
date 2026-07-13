<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class Handler extends ExceptionHandler
{
    /**
     * The list of the inputs that are never flashed to the session on validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     */
    public function register(): void
    {
        $this->reportable(function (Throwable $e) {
            //
        });
    }

    /**
     * API-only app: unauthenticated requests always get a 401 JSON
     * response. Never fall back to redirect()->guest(route('login'))
     * because no `login` web route exists.
     */
    protected function unauthenticated($request, AuthenticationException $exception): Response
    {
        return response()->json([
            'message' => $exception->getMessage() ?: 'Unauthenticated.',
        ], 401);
    }
}
