<?php

namespace UpdiveNSM\OS;

use UpdiveNSM\Device\WirelessSensor;
use UpdiveNSM\Enum\WirelessSensorType;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessErrorsDiscovery;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessPowerDiscovery;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessRssiDiscovery;
use UpdiveNSM\Interfaces\Discovery\Sensors\WirelessSnrDiscovery;
use UpdiveNSM\OS;

class HarmonyEnhanced extends OS implements WirelessRssiDiscovery, WirelessSnrDiscovery, WirelessPowerDiscovery, WirelessErrorsDiscovery
{
    public function discoverWirelessRssi()
    {
        $oids = snmpwalk_cache_oid($this->getDeviceArray(), 'mwrEmcRadioRSL', [], 'MWR-RADIO-MC-MIB', null, '-Ob');
        $sensors = [];
        foreach ($oids as $index => $entry) {
            $sensors[] = new WirelessSensor(
                WirelessSensorType::Rssi,
                $this->getDeviceId(),
                '.1.3.6.1.4.1.7262.4.5.12.203.1.1.5.' . $index,
                'harmony_enhanced',
                $index,
                'RSL Radio ' . $index,
                divisor: 10
            );
        }

        return $sensors;
    }

    public function discoverWirelessSnr()
    {
        $oids = snmpwalk_cache_oid($this->getDeviceArray(), 'mwrEmcRadioSNR', [], 'MWR-RADIO-MC-MIB', null, '-Ob');
        $sensors = [];
        foreach ($oids as $index => $entry) {
            $sensors[] = new WirelessSensor(
                WirelessSensorType::Snr,
                $this->getDeviceId(),
                '.1.3.6.1.4.1.7262.4.5.12.203.1.1.7.' . $index,
                'harmony_enhanced',
                $index,
                'SNR Radio ' . $index,
                divisor: 10
            );
        }

        return $sensors;
    }

    public function discoverWirelessPower()
    {
        $oids = snmpwalk_cache_oid($this->getDeviceArray(), 'mwrEmcRadioActualTxPower', [], 'MWR-RADIO-MC-MIB', null, '-Ob');
        $sensors = [];
        foreach ($oids as $index => $entry) {
            $sensors[] = new WirelessSensor(
                WirelessSensorType::Power,
                $this->getDeviceId(),
                '.1.3.6.1.4.1.7262.4.5.12.203.1.1.9.' . $index,
                'harmony_enhanced',
                $index,
                'TX Power Radio ' . $index,
                divisor: 10
            );
        }

        return $sensors;
    }

    public function discoverWirelessErrors()
    {
        $oids = snmpwalk_cache_oid($this->getDeviceArray(), 'mwrEmcRadioRxErrsFrames', [], 'MWR-RADIO-MC-MIB', null, '-Ob');
        $sensors = [];
        foreach ($oids as $index => $entry) {
            $sensors[] = new WirelessSensor(
                WirelessSensorType::Errors,
                $this->getDeviceId(),
                '.1.3.6.1.4.1.7262.4.5.12.203.1.1.4.' . $index,
                'harmony_enhanced',
                $index,
                'RX Errors Radio ' . $index
            );
        }

        return $sensors;
    }
}
