<?php

/**
 * EltexMes23xx.php
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
 * @copyright  2022 PipoCanaja
 * @author     PipoCanaja
 * @author     Peca Nesovanovic
 */

namespace UpdiveNSM\OS;

use App\Facades\PortCache;
use App\Models\EntPhysical;
use App\Models\Ipv6Address;
use App\Models\Transceiver;
use App\Models\Mempool;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use UpdiveNSM\Device\Processor;
use UpdiveNSM\Exceptions\InvalidIpException;
use UpdiveNSM\Interfaces\Discovery\Ipv6AddressDiscovery;
use UpdiveNSM\Interfaces\Discovery\TransceiverDiscovery;
use UpdiveNSM\Interfaces\Discovery\ProcessorDiscovery;
use UpdiveNSM\Interfaces\Discovery\MempoolsDiscovery;
use UpdiveNSM\OS\Shared\Radlan;
use UpdiveNSM\OS\Traits\EntityMib;
use UpdiveNSM\Util\IPv6;
use UpdiveNSM\Util\StringHelpers;
use SnmpQuery;

class EltexMes23xx extends Radlan implements TransceiverDiscovery, Ipv6AddressDiscovery, ProcessorDiscovery, MempoolsDiscovery
{
    use EntityMib {
        EntityMib::discoverEntityPhysical as discoverBaseEntityPhysical;
    }

    public function discoverEntityPhysical(): Collection
    {
        return $this->discoverBaseEntityPhysical()->each(function (EntPhysical $entity) {
            if ($entity->entPhysicalClass == 'sensor') {
                if (str_contains($entity->entPhysicalDescr, 'Temperature')) {
                    $entity->sensor_type = 'temperature';
                }
            }
        });
    }

    public function discoverProcessors(): array
    {
        $usage = snmp_get($this->getDeviceArray(), '.1.3.6.1.4.1.89.1.7.0', '-Osnqv');
        if (is_numeric($usage)) {
            return [
                Processor::discover(
                    'eltex',
                    $this->getDeviceId(),
                    '.1.3.6.1.4.1.89.1.7.0',
                    0,
                    'CPU',
                    1,
                    $usage
                ),
            ];
        }
        return [];
    }

    public function discoverMempools(): Collection
    {
        $oid = '.1.3.6.1.4.1.89.1.9.0';
        $memory = snmp_get($this->getDeviceArray(), $oid, '-OQv');

        if (!is_numeric($memory)) {
            return new Collection();
        }

        return collect([(new Mempool([
            'device_id' => $this->getDeviceId(),
            'mempool_index' => 0,
            'mempool_type' => 'eltex',
            'mempool_class' => 'system',
            'mempool_descr' => 'Memory',
            'mempool_perc_oid' => $oid,
        ]))->fillUsage(null, null, null, $memory)]);
    }

    public function discoverTransceivers(): Collection
    {
        return SnmpQuery::walk('.1.3.6.1.4.1.35265.1.23.1.1.31.1.1.1.1.1')
            ->mapTable(fn ($data) => new Transceiver([
                'port_id' => PortCache::getIdFromIfIndex($data['ifIndex'], $this->getDevice()),
                'connector' => $data['eltexPhyTransceiverInfoConnectorType'] ? strtoupper((string) $data['eltexPhyTransceiverInfoConnectorType']) : null,
                'distance' => $data['eltexPhyTransceiverInfoTransferDistance'] ?? null,
                'model' => $data['eltexPhyTransceiverInfoPartNumber'] ?? null,
                'revision' => $data['eltexPhyTransceiverInfoVendorRevision'] ?? null,
                'serial' => $data['eltexPhyTransceiverInfoSerialNumber'] ?? null,
                'vendor' => $data['eltexPhyTransceiverInfoVendorName'] ?? null,
                'wavelength' => $data['eltexPhyTransceiverInfoWaveLength'] ?? null,
            ]));
    }

    public function discoverIpv6Addresses(): Collection
    {
        $ips = SnmpQuery::walk([
            'RADLAN-IPv6::rlIpAddressTable',
        ])->mapTable(function ($data, $addrType, $address = '') {
            if ($addrType == 'ipv6') {
                try {
                    $ip = IPv6::fromHexString($address);

                    return new Ipv6Address([
                        'ipv6_address' => $ip->uncompressed(),
                        'ipv6_compressed' => $ip->compressed(),
                        'ipv6_prefixlen' => $data['RADLAN-IPv6::rlIpAddressPrefixLength'] ?? '',
                        'ipv6_origin' => $data['RADLAN-IPv6::rlIpAddressType'] ?? 'unknown',
                        'port_id' => PortCache::getIdFromIfIndex($data['IP-MIB::ipAddressIfIndex'], $this->getDevice()),
                    ]);
                } catch (InvalidIpException $e) {
                    Log::error('Failed to parse IP: ' . $e->getMessage());

                    return null;
                }
            }
            return null;
        });

        return $ips->filter();
    }
}
