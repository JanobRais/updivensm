<?php

/*
 * UpdiveNSM
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.  Please see LICENSE.txt at the top level of
 * the source code distribution for details.
 *
 * @package    UpdiveNSM
 * @subpackage webui
 * @link       http://UpdiveNSM.org
 * @copyright  2018 UpdiveNSM
 * @author     UpdiveNSM Contributors
*/

use Illuminate\Support\Str;

if (Str::startsWith($device['sysObjectID'], '.1.3.6.1.4.1.1248.4.1')) {
    discover_sensor(
        null,
        'count',
        $device,
        '.1.3.6.1.4.1.1248.4.1.1.1.1.0',
        0,
        'epson-projector',
        'Lamp Hours',
        1,
        1,
        null,
        null,
        null,
        null,
        SnmpQuery::get('.1.3.6.1.4.1.1248.4.1.1.1.1.0')->value()
    );
}
