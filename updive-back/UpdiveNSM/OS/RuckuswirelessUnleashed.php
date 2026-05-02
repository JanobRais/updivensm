<?php

namespace UpdiveNSM\OS;

use UpdiveNSM\Device\WirelessSensor;
use UpdiveNSM\Enum\WirelessSensorType;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessApCountDiscovery;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessClientsDiscovery;
use UpdiveNSM\OS;

class RuckuswirelessUnleashed extends OS implements
    WirelessClientsDiscovery,
    WirelessApCountDiscovery
{
    public function discoverWirelessClients()
    {
        $oid = '.1.3.6.1.4.1.25053.1.15.1.1.1.15.2.0'; //RUCKUS-UNLEASHED-SYSTEM-MIB::ruckusUnleashedSystemStatsNumSta.0

        return [
            new WirelessSensor(WirelessSensorType::Clients, $this->getDeviceId(), $oid, 'ruckuswireless-unleashed', 1, 'Clients: Total'),
        ];
    }

    public function discoverWirelessApCount()
    {
        $oid = '.1.3.6.1.4.1.25053.1.15.1.1.1.15.1.0'; //RUCKUS-UNLEASHED-SYSTEM-MIB:: ruckusUnleashedSystemStatsNumAP.0

        return [
            new WirelessSensor(WirelessSensorType::ApCount, $this->getDeviceId(), $oid, 'ruckuswireless-unleashed', 1, 'Connected APs'),
        ];
    }
}
