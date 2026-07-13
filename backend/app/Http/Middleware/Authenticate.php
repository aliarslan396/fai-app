<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;
use Illuminate\Http\Request;

class Authenticate extends Middleware
{
    /**
     * Get the path the user should be redirected to when they are not authenticated.
     */
    protected function redirectTo(Request $request): ?string
    {
        // API-only app — no web login route exists.
        // Always return null so unauth requests get a 401 JSON response
        // instead of tripping RouteNotFoundException on route('login').
        return null;
    }
}
