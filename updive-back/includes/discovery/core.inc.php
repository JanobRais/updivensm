<?php

use UpdiveNSM\OS;
use UpdiveNSM\OS\Generic;

// start assuming no os
(new \UpdiveNSM\Modules\Core())->discover(Generic::make($device));

// then create with actual OS
$os = OS::make($device);
