<?php

/*
 * IbmImm.php
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
 * @package    UpdiveNSM
 * @link       https://www.UpdiveNSM.org
 * @copyright  2025 Peca Nesovanovic
 * @author     Peca Nesovanovic <peca.nesovanovic@sattrakt.com>
 */

namespace UpdiveNSM\OS;

use App\Models\Device;
use UpdiveNSM\Interfaces\Discovery\OSDiscovery;
use SnmpQuery;

class IbmImm extends \UpdiveNSM\OS implements OSDiscovery
{
    public function discoverOS(Device $device): void
    {
        parent::discoverOS($device); // yaml

        $device->features = implode(' ', SnmpQuery::walk('IMM-MIB::immVpdType')->pluck());
    }
}
