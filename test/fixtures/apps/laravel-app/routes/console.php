<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('orders:purge')->dailyAt('1:00');
