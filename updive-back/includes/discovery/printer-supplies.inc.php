<?php

use UpdiveNSM\OS;

if (! $os instanceof OS) {
    $os = OS::make($device);
}
(new \UpdiveNSM\Modules\PrinterSupplies())->discover($os);
