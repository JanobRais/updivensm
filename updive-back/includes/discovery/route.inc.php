<?php

use UpdiveNSM\OS;

if (empty($os) || ! $os instanceof OS) {
    $os = OS::make($device);
}

(new \UpdiveNSM\Modules\Routes())->discover($os);
