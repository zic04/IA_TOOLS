<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\PaymentController;
use Illuminate\Support\Facades\Route;

Route::view('/', 'welcome');

// Route::get('/legacy', [OrderController::class, 'legacy']);
# Route::delete('/purge', [OrderController::class, 'purge']);
/* Route::post('/old-import', [OrderController::class, 'import']); */

Route::middleware('auth')->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
    Route::resource('orders', OrderController::class)->except(['destroy']);

    Route::prefix('admin')->middleware(['can:admin'])->group(function () {
        Route::get('/reports', [DashboardController::class, 'reports']);
        Route::match(['get', 'post'], '/settings', [DashboardController::class, 'settings'])
            ->middleware('role:admin');
    });

    Route::post('/hooks/payment', [PaymentController::class, 'hook'])->withoutMiddleware(['auth']);
});

Route::group(['prefix' => 'shop', 'middleware' => 'throttle:60,1'], function () {
    Route::get('/categories/{category}', [OrderController::class, 'category']);
});
