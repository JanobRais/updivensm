<?php

/*
 * UpdiveNSM
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.  Please see LICENSE.txt at the top level of
 * the source code distribution for details.
 *
 * @package    UpdiveNSM
 * @subpackage webui
 * @link       https://www.UpdiveNSM.org
 * @copyright  2018 UpdiveNSM
 * @author     UpdiveNSM Contributors
*/

namespace UpdiveNSM\OS;

use Illuminate\Support\Str;
use UpdiveNSM\Device\Processor;
use UpdiveNSM\Interfaces\Discovery\ProcessorDiscovery;
use UpdiveNSM\OS;

class Sonicwall extends OS implements ProcessorDiscovery
{
    /**
     * Discover processors.
     * Returns an array of UpdiveNSM\Device\Processor objects that have been discovered
     *
     * @return array Processors
     */
    public function discoverProcessors()
    {
        if (Str::startsWith($this->getDeviceArray()['sysObjectID'], '.1.3.6.1.4.1.8741.1')) {
            return [
                Processor::discover(
                    'sonicwall',
                    $this->getDeviceId(),
                    '.1.3.6.1.4.1.8741.1.3.1.3.0',  // SONICWALL-FIREWALL-IP-STATISTICS-MIB::sonicCurrentCPUUtil.0
                    0,
                    'CPU',
                    1
                ),
            ];
        } else {
            return [
                Processor::discover(
                    'sonicwall',
                    $this->getDeviceId(),
                    $this->getDeviceArray()['sysObjectID'] . '.2.1.3.0',  // different OID for each model
                    0,
                    'CPU',
                    1
                ),
            ];
        }
    }
}
