<?php

namespace UpdiveNSM\OS;

use UpdiveNSM\Device\WirelessSensor;
use UpdiveNSM\Enum\WirelessSensorType;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessErrorsDiscovery;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessPowerDiscovery;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessRssiDiscovery;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessSnrDiscovery;
use UpdiveNSM\OS;

class HorizonCompactplus extends OS implements WirelessSnrDiscovery, WirelessPowerDiscovery, WirelessRssiDiscovery, WirelessErrorsDiscovery
{
    public function discoverWirelessSnr()
    {
        $oid = '.1.3.6.1.4.1.7262.2.5.4.2.1.1.8.1';

        return [
            new WirelessSensor(WirelessSensorType::Snr, $this->getDeviceId(), $oid, 'horizon-compactplus', 0, 'SNR', null, 1, 10),
        ];
    }

    public function discoverWirelessPower()
    {
        $oid = '.1.3.6.1.4.1.7262.2.5.4.4.1.1.7.1';

        return [
            new WirelessSensor(WirelessSensorType::Power, $this->getDeviceId(), $oid, 'horizon-compactplus', 0, 'Tx Power', null, 1, 10),
        ];
    }

    public function discoverWirelessRssi()
    {
        $oid = '.1.3.6.1.4.1.7262.2.5.4.2.1.1.3.1';

        return [
            new WirelessSensor(WirelessSensorType::Rssi, $this->getDeviceId(), $oid, 'horizon-compactplus', 0, 'RSL', null, 1, 10),
        ];
    }

    public function discoverWirelessErrors()
    {
        $oid = '.1.3.6.1.4.1.7262.2.5.4.2.2.1.4.1';

        return [
            new WirelessSensor(WirelessSensorType::Errors, $this->getDeviceId(), $oid, 'horizon-compactplus', 0, 'Rx Errors'),
        ];
    }
}
