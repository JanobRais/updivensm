#!/usr/bin/env php
<?php

/*
 * Configuration to JSON converter
 * Written by Job Snijders <job@instituut.net>
 *
 */

use App\Facades\UpdiveNSMConfig;

$init_modules = ['nodb'];
require __DIR__ . '/includes/init.php';

if (App::runningInConsole()) {
    echo UpdiveNSMConfig::toJson();
}
