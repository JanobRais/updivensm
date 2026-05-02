<?php

use UpdiveNSM\OS;

if (! $os instanceof OS) {
    $os = OS::make($device);
}
(new \UpdiveNSM\Modules\Ospfv3())->poll($os, app('Datastore'));
