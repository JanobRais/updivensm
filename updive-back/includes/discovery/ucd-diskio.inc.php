<?php

use UpdiveNSM\OS;

if (! isset($os) || ! $os instanceof OS) {
    $os = OS::make($device);
}

(new \UpdiveNSM\Modules\UcdDiskio())->discover($os);
