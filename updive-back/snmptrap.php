#!/usr/bin/env php
<?php

/**
 * UpdiveNSM
 *
 *   This file is part of UpdiveNSM.
 *
 * @copyright  (C) 2006 - 2012 Adam Armstrong
 * @copyright  (C) 2018 UpdiveNSM
 * Adapted from old snmptrap.php handler
 */

use UpdiveNSM\Util\Debug;

$init_modules = [];
require __DIR__ . '/includes/init.php';

$options = getopt('d::');

if (Debug::set(isset($options['d']))) {
    echo "DEBUG!\n";
}

$text = stream_get_contents(STDIN);

// create handle and send it this trap
\UpdiveNSM\Snmptrap\Dispatcher::handle(new \UpdiveNSM\Snmptrap\Trap($text));
