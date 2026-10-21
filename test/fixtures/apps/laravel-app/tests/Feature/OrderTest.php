<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class OrderTest extends TestCase
{
    public function test_a_route_declared_by_a_test_is_never_read(): void
    {
        Route::get('/test-only', fn () => 'ok');
        $this->get('/test-only')->assertOk();
        \App\Models\Order::query()->orderBy('test_rank', 'desc')->get();
    }
}
