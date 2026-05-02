<?php

use UpdiveNSM\OS;

if (empty($os) || ! $os instanceof OS) {
    $os = OS::make($device);
}

(new \UpdiveNSM\Modules\Ipv4Addresses())->discover($os);
