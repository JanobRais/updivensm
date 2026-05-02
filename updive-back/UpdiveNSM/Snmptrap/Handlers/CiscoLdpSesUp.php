<?php

/**
 * CiscoLdpSesUp.php
 *
 * -Description-
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
 * Cisco LDP Session Up.
 *
 * @link       https://www.UpdiveNSM.org
 *
 * @author     Olivier MORFIN - <morfin.olivier@gmail.com>
 */

namespace UpdiveNSM\Snmptrap\Handlers;

use App\Models\Device;
use UpdiveNSM\Enum\Severity;
use UpdiveNSM\Interfaces\SnmptrapHandler;
use UpdiveNSM\Snmptrap\Trap;
use Log;

class CiscoLdpSesUp implements SnmptrapHandler
{
    /**
     * Handle snmptrap.
     * Data is pre-parsed and delivered as a Trap.
     *
     * @param  Device  $device
     * @param  Trap  $trap
     * @return void
     */
    public function handle(Device $device, Trap $trap)
    {
        $ifIndex = $trap->getOidData($trap->findOid('IF-MIB::ifIndex'));
        $port = $device->ports()->where('ifIndex', $ifIndex)->first();
        /*
        if (! $port) {
            $trap->log("Snmptrap CiscoLdpSesUp: Could not find port at ifIndex $ifIndex for device: $device->hostname", Severity::Warning);
//            Log::warning("Snmptrap CiscoLdpSesUp: Could not find port at ifIndex $ifIndex for device: " . $device->hostname);

            return;
        }
        */
        $severity = Severity::Ok;
        $trap->log("LDP session UP on interface $port->ifDescr - $port->ifAlias", $severity, 'interface', $port->port_id);
    }
}
