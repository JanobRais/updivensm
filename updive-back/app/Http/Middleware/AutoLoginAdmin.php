<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AutoLoginAdmin
{
    /**
     * Handle an incoming request.
     *
     * @param  Request  $request
     * @param  Closure  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $admin = \App\Models\User::where('username', 'admin')->first();
        if ($admin) {
            auth()->login($admin);
        }
        return $next($request);
    }
}
