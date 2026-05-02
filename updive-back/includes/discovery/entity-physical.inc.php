<?php

use UpdiveNSM\Modules\EntityPhysical;
use UpdiveNSM\OS;

if (! isset($os) || ! $os instanceof OS) {
    $os = OS::make($device);
}
(new EntityPhysical())->discover($os);
