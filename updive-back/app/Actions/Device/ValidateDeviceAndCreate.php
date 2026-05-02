<?php

/*
 * ValidateDeviceAndCreate.php
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
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @package    UpdiveNSM
 * @link       http://UpdiveNSM.org
 * @copyright  2022 Tony Murray
 * @author     Tony Murray <murraytony@gmail.com>
 */

namespace App\Actions\Device;

use App\Facades\UpdiveNSMConfig;
use App\Models\Device;
use Illuminate\Support\Arr;
use UpdiveNSM\Enum\PortAssociationMode;
use UpdiveNSM\Exceptions\HostIpExistsException;
use UpdiveNSM\Exceptions\HostNameEmptyException;
use UpdiveNSM\Exceptions\HostnameExistsException;
use UpdiveNSM\Exceptions\HostSysnameExistsException;
use UpdiveNSM\Exceptions\HostUnreachablePingException;
use UpdiveNSM\Exceptions\HostUnreachableSnmpException;
use UpdiveNSM\Exceptions\SnmpVersionUnsupportedException;
use UpdiveNSM\Modules\Core;
use SnmpQuery;

class ValidateDeviceAndCreate
{
    public function __construct(private readonly Device $device, private readonly bool $force = false, private readonly bool $ping_fallback = false)
    {
    }

    /**
     * @return bool
     *
     * @throws \UpdiveNSM\Exceptions\HostExistsException
     * @throws HostUnreachablePingException
     * @throws \UpdiveNSM\Exceptions\HostUnreachableException
     * @throws SnmpVersionUnsupportedException
     */
    public function execute(): bool
    {
        if (empty($this->device->hostname)) {
            throw new HostNameEmptyException();
        }

        if ($this->device->exists) {
            return false;
        }

        $this->exceptIfHostnameExists();
        $this->fillDefaults();

        if (! $this->force) {
            $this->exceptIfIpExists();

            if (! app(DeviceIsPingable::class)->execute($this->device)->success()) {
                throw new HostUnreachablePingException($this->device->hostname);
            }

            $this->detectCredentials();
            $this->cleanCredentials();

            if (! $this->device->snmp_disable) {
                $this->device->sysName = SnmpQuery::device($this->device)->get('SNMPv2-MIB::sysName.0')->value();
                $this->exceptIfSysNameExists();

                $this->device->os = Core::detectOS($this->device);
            }
        }

        return $this->device->save();
    }

    /**
     * @throws \UpdiveNSM\Exceptions\HostUnreachableException
     * @throws SnmpVersionUnsupportedException
     */
    private function detectCredentials(): void
    {
        if ($this->device->snmp_disable) {
            return;
        }

        $host_unreachable_exception = new HostUnreachableSnmpException($this->device->hostname);

        // which snmp version should we try (and in what order)
        $snmp_versions = $this->device->snmpver ? [$this->device->snmpver] : UpdiveNSMConfig::get('snmp.version');

        $communities = Arr::where(Arr::wrap(UpdiveNSMConfig::get('snmp.community')), fn ($community) => $community && is_string($community));
        if ($this->device->community) {
            array_unshift($communities, $this->device->community);
        }
        $communities = array_unique($communities);

        $v3_credentials = UpdiveNSMConfig::get('snmp.v3');
        array_unshift($v3_credentials, $this->device->only(['authlevel', 'authname', 'authpass', 'authalgo', 'cryptopass', 'cryptoalgo']));
        $v3_credentials = array_unique($v3_credentials, SORT_REGULAR);

        foreach ($snmp_versions as $snmp_version) {
            $this->device->snmpver = $snmp_version;

            if ($snmp_version === 'v3') {
                // Try each set of parameters from config
                foreach ($v3_credentials as $v3) {
                    $this->device->fill(Arr::only($v3, ['authlevel', 'authname', 'authpass', 'authalgo', 'cryptopass', 'cryptoalgo']));

                    if (app(DeviceIsSnmpable::class)->execute($this->device)) {
                        return;
                    } else {
                        $host_unreachable_exception->addReason($snmp_version, $this->device->authname . '/' . $this->device->authlevel);
                    }
                }
            } elseif ($snmp_version === 'v2c' || $snmp_version === 'v1') {
                // try each community from config
                foreach ($communities as $community) {
                    $this->device->community = $community;
                    if (app(DeviceIsSnmpable::class)->execute($this->device)) {
                        return;
                    } else {
                        $host_unreachable_exception->addReason($snmp_version, $this->device->community);
                    }
                }
            } else {
                throw new SnmpVersionUnsupportedException($snmp_version);
            }
        }

        if ($this->ping_fallback) {
            $this->device->snmp_disable = true;
            $this->device->os = 'ping';

            return;
        }

        throw $host_unreachable_exception;
    }

    private function cleanCredentials(): void
    {
        if ($this->device->snmpver == 'v3') {
            $this->device->community = null;
        } else {
            $this->device->authlevel = null;
            $this->device->authname = null;
            $this->device->authalgo = null;
            $this->device->cryptopass = null;
            $this->device->cryptoalgo = null;
        }
    }

    private function fillDefaults(): void
    {
        $this->device->port = $this->device->port ?: UpdiveNSMConfig::get('snmp.port', 161);
        $this->device->transport = $this->device->transport ?: UpdiveNSMConfig::get('snmp.transports.0', 'udp');
        $this->device->poller_group = $this->device->poller_group ?: UpdiveNSMConfig::get('default_poller_group', 0);
        $this->device->os = $this->device->os ?: 'generic';
        $this->device->status_reason = '';
        $this->device->sysName = $this->device->sysName ?: $this->device->hostname;
        $this->device->port_association_mode = $this->device->port_association_mode ?: UpdiveNSMConfig::get('default_port_association_mode', 'ifIndex');
        if (! is_int($this->device->port_association_mode)) {
            $this->device->port_association_mode = PortAssociationMode::getId($this->device->port_association_mode) ?? 1;
        }
    }

    /**
     * @throws \UpdiveNSM\Exceptions\HostExistsException
     */
    private function exceptIfHostnameExists(): void
    {
        if (Device::where('hostname', $this->device->hostname)->exists()) {
            throw new HostnameExistsException($this->device->hostname);
        }
    }

    /**
     * @throws \UpdiveNSM\Exceptions\HostExistsException
     */
    private function exceptIfIpExists(): void
    {
        if ($this->device->overwrite_ip) {
            $ip = $this->device->overwrite_ip;
        } elseif (UpdiveNSMConfig::get('addhost_alwayscheckip')) {
            $ip = gethostbyname($this->device->hostname);
        } else {
            $ip = $this->device->hostname;
        }

        $existing = Device::findByIp($ip);

        if ($existing) {
            throw new HostIpExistsException($this->device->hostname, $existing->hostname, $ip);
        }
    }

    /**
     * Check if a device with match hostname or sysname exists in the database.
     * Throw and error if they do.
     *
     * @return void
     *
     * @throws \UpdiveNSM\Exceptions\HostExistsException
     */
    private function exceptIfSysNameExists(): void
    {
        if (UpdiveNSMConfig::get('allow_duplicate_sysName')) {
            return;
        }

        if (Device::where('sysName', $this->device->sysName)
            ->when(UpdiveNSMConfig::get('mydomain'), function ($query, $domain): void {
                $query->orWhere('sysName', rtrim($this->device->sysName, '.') . '.' . $domain);
            })->exists()) {
            throw new HostSysnameExistsException($this->device->hostname, $this->device->sysName);
        }
    }
}
