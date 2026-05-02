<?php

/**
 * Netsure.php
 *
 * Emerson Power Vortex Controllers
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * @link       https://www.UpdiveNSM.org
 *
 * @author     Craig Harris
 */

namespace UpdiveNSM\OS;

use App\Models\Device;
use UpdiveNSM\Interfaces\Discovery\OSDiscovery;
use UpdiveNSM\OS;

class Netsure extends OS implements OSDiscovery
{
    public function discoverOS(Device $device): void
    {
        $device->version = snmp_getnext($this->getDeviceArray(), 'vecFirmwareVersion', '-Oqv', 'VEC-MIBv5-9');
    }
}
