<?php

/*
 * Fortigate.php
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
 * @copyright  2020 Tony Murray
 * @author     Tony Murray <murraytony@gmail.com>
 */

namespace UpdiveNSM\OS;

use App\Models\Device;
use Illuminate\Support\Facades\Log;
use UpdiveNSM\Device\WirelessSensor;
use UpdiveNSM\Enum\WirelessSensorType;
use UpdiveNSM\Interfaces\Data\DataStorageInterface;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessApCountDiscovery;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessClientsDiscovery;
use UpdiveNSM\Interfaces\Polling\OSPolling;
use UpdiveNSM\OS;
use UpdiveNSM\RRD\RrdDefinition;

class Fortigate extends OS implements
    OSPolling,
    WirelessClientsDiscovery,
    WirelessApCountDiscovery
{
    public function discoverOS(Device $device): void
    {
        parent::discoverOS($device); // yaml
    }

    public function pollOS(DataStorageInterface $datastore): void
    {
        $sessions = snmp_get($this->getDeviceArray(), 'FORTINET-FORTIGATE-MIB::fgSysSesCount.0', '-Ovq');
        if (is_numeric($sessions)) {
            $rrd_def = RrdDefinition::make()->addDataset('sessions', 'GAUGE', 0, 3000000);

            Log::info("Sessions: $sessions");
            $fields = [
                'sessions' => $sessions,
            ];

            $tags = ['rrd_def' => $rrd_def];
            $datastore->put($this->getDeviceArray(), 'fortigate_sessions', $tags, $fields);
            $this->enableGraph('fortigate_sessions');
        }

        $cpu_usage = snmp_get($this->getDeviceArray(), 'FORTINET-FORTIGATE-MIB::fgSysCpuUsage.0', '-Ovq');
        if (is_numeric($cpu_usage)) {
            $rrd_def = RrdDefinition::make()->addDataset('LOAD', 'GAUGE', -1, 100);

            Log::info("CPU: $cpu_usage%");
            $fields = [
                'LOAD' => $cpu_usage,
            ];

            $tags = ['rrd_def' => $rrd_def];
            $datastore->put($this->getDeviceArray(), 'fortigate_cpu', $tags, $fields);
            $this->enableGraph('fortigate_cpu');
        }
    }

    public function discoverWirelessClients()
    {
        $oid = '.1.3.6.1.4.1.12356.101.14.2.7.0';

        return [
            new WirelessSensor(WirelessSensorType::Clients, $this->getDeviceId(), $oid, 'fortigate', 1, 'Clients: Total'),
        ];
    }

    public function discoverWirelessApCount()
    {
        $oid = '.1.3.6.1.4.1.12356.101.14.2.5.0';

        return [
            new WirelessSensor(WirelessSensorType::ApCount, $this->getDeviceId(), $oid, 'fortigate', 1, 'Connected APs'),
        ];
    }
}
