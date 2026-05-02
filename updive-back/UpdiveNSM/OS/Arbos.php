<?php

/**
 * Arbos.php
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
 * @link       https://www.UpdiveNSM.org
 *
 * @copyright  2021 Tony Murray
 * @author     Tony Murray <murraytony@gmail.com>
 */

namespace UpdiveNSM\OS;

use UpdiveNSM\Interfaces\Data\DataStorageInterface;
use UpdiveNSM\Interfaces\Polling\OSPolling;
use UpdiveNSM\OS;
use UpdiveNSM\RRD\RrdDefinition;
use SnmpQuery;

class Arbos extends OS implements OSPolling
{
    public function pollOS(DataStorageInterface $datastore): void
    {
        $flows = SnmpQuery::get('PEAKFLOW-SP-MIB::deviceTotalFlows.0')->value();

        if (is_numeric($flows)) {
            $datastore->put($this->getDeviceArray(), 'arbos_flows', [
                'rrd_def' => RrdDefinition::make()->addDataset('flows', 'GAUGE', 0, 3000000),
            ], [
                'flows' => $flows,
            ]);

            $this->enableGraph('arbos_flows');
        }
    }
}
