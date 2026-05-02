<?php

/**
 * HiveosWireless.php
 *
 * AeroHive Hiveos-Wireless
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
 * @copyright  2018 Ryan Finney
 * @author     https://github.com/theherodied/
 */

namespace UpdiveNSM\OS;

use UpdiveNSM\Device\Processor;
use UpdiveNSM\Device\WirelessSensor;
use UpdiveNSM\Enum\WirelessSensorType;
use UpdiveNSM\Interfaces\Discovery\ProcessorDiscovery;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessClientsDiscovery;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessFrequencyDiscovery;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessNoiseFloorDiscovery;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessPowerDiscovery;
use UpdiveNSM\Interfaces\Polling\Sensors\WirelessFrequencyPolling;
use UpdiveNSM\Interfaces\Polling\Sensors\WirelessNoiseFloorPolling;
use UpdiveNSM\OS;

class HiveosWireless extends OS implements
    WirelessClientsDiscovery,
    WirelessFrequencyDiscovery,
    WirelessFrequencyPolling,
    WirelessNoiseFloorDiscovery,
    WirelessNoiseFloorPolling,
    WirelessPowerDiscovery,
    ProcessorDiscovery
{
    /**
     * Discover processors.
     * Returns an array of UpdiveNSM\Device\Processor objects that have been discovered
     *
     * @return array Processors
     */
    public function discoverProcessors(): array
    {
        return [
            Processor::discover(
                $this->getName(),
                $this->getDeviceId(),
                '1.3.6.1.4.1.26928.1.2.3.0', // AH-SYSTEM-MIB::ahCpuUtilization
                0
            ),
        ];
    }

    /**
     * Discover wireless client counts. Type is clients.
     * Returns an array of UpdiveNSM\Device\Sensor objects that have been discovered
     *
     * @return array Sensors
     */
    public function discoverWirelessClients()
    {
        $oid = '.1.3.6.1.4.1.26928.1.2.9.0'; // AH-SYSTEM-MIB::ahClientCount

        return [
            new WirelessSensor(WirelessSensorType::Clients, $this->getDeviceId(), $oid, 'HiveosWireless', 1, 'Clients'),
        ];
    }

    /**
     * Discover wireless frequency.  This is in GHz. Type is frequency.
     * Returns an array of UpdiveNSM\Device\Sensor objects that have been discovered
     *
     * @return array Sensors
     */
    public function pollWirelessFrequency(array $sensors)
    {
        return $this->pollWirelessChannelAsFrequency($sensors);
    }

    public function discoverWirelessFrequency()
    {
        $ahRadioName = $this->getCacheByIndex('ahIfName', 'AH-INTERFACE-MIB');
        $data = snmpwalk_group($this->getDeviceArray(), 'ahRadioChannel', 'AH-INTERFACE-MIB');
        $sensors = [];
        foreach ($data as $index => $frequency) {
            $sensors[] = new WirelessSensor(
                WirelessSensorType::Frequency,
                $this->getDeviceId(),
                '.1.3.6.1.4.1.26928.1.1.1.2.1.5.1.1.' . $index,
                'hiveos-wireless',
                $index,
                $ahRadioName[$index],
                WirelessSensor::channelToFrequency($frequency['ahRadioChannel'])
            );
        }

        return $sensors;
    }

    /**
     * Discover wireless tx power. This is in dBm. Type is power.
     * Returns an array of UpdiveNSM\Device\Sensor objects that have been discovered
     *
     * @return array
     */
    public function discoverWirelessPower()
    {
        $sensors = [];

        $ahRadioName = $this->getCacheByIndex('ahIfName', 'AH-INTERFACE-MIB');
        $ahTxPow = snmpwalk_group($this->getDeviceArray(), 'ahRadioTxPower', 'AH-INTERFACE-MIB');
        foreach ($ahTxPow as $index => $entry) {
            $sensors[] = new WirelessSensor(
                WirelessSensorType::Power,
                $this->getDeviceId(),
                '.1.3.6.1.4.1.26928.1.1.1.2.1.5.1.2.' . $index,
                'hiveos-wireless',
                $index,
                'Tx Power: ' . $ahRadioName[$index],
                $entry['ahRadioTxPower']
            );
        }

        return $sensors;
    }

    public function discoverWirelessNoiseFloor()
    {
        $ahRadioName = $this->getCacheByIndex('ahIfName', 'AH-INTERFACE-MIB');
        $ahRadioNoiseFloor = snmpwalk_group($this->getDeviceArray(), 'ahRadioNoiseFloor', 'AH-INTERFACE-MIB');
        $sensors = [];
        foreach ($ahRadioNoiseFloor as $index => $entry) {
            $sensors[] = new WirelessSensor(
                WirelessSensorType::NoiseFloor,
                $this->getDeviceId(),
                '.1.3.6.1.4.1.26928.1.1.1.2.1.5.1.3.' . $index,
                'hiveos-wireless',
                $index,
                'Noise floor ' . $ahRadioName[$index],
                $entry['ahRadioNoiseFloor'] - 256
            );
        }

        return $sensors;
    }

    /**
     * Poll wireless noise floor
     * The returned array should be sensor_id => value pairs
     *
     * @param  array  $sensors  Array of sensors needed to be polled
     * @return array of polled data
     */
    public function pollWirelessNoiseFloor(array $sensors)
    {
        $data = [];
        $ahRadioNoiseFloor = snmpwalk_group($this->getDeviceArray(), 'ahRadioNoiseFloor', 'AH-INTERFACE-MIB');
        foreach ($sensors as $sensor) {
            $data[$sensor['sensor_id']] = $ahRadioNoiseFloor[$sensor['sensor_index']]['ahRadioNoiseFloor'] - 256;
        }

        return $data;
    }
}
