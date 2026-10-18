<?php

namespace App\Console;

use App\Jobs\SyncStock;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    protected function schedule(Schedule $schedule): void
    {
        $schedule->command('reports:send')->cron('0 * * * *');
        $schedule->job(new SyncStock)->weekdays()->hourly();
    }
}
