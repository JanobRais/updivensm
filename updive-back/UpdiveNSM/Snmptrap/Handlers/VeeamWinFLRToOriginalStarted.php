<?php

namespace UpdiveNSM\Snmptrap\Handlers;

use App\Models\Device;
use UpdiveNSM\Enum\Severity;
use UpdiveNSM\Interfaces\SnmptrapHandler;
use UpdiveNSM\Snmptrap\Trap;

class VeeamWinFLRToOriginalStarted extends VeeamTrap implements SnmptrapHandler
{
    /**
     * Handle snmptrap.
     * Data is pre-parsed and delivered as a Trap.
     *
     * @param  Device  $device
     * @param  Trap  $trap
     * @return void
     */
    public function handle(Device $device, Trap $trap)
    {
        $initiator_name = $trap->getOidData('VEEAM-MIB::initiatorName');
        $vm_name = $trap->getOidData('VEEAM-MIB::vmName');

        $trap->log('SNMP Trap: FLR job started - ' . $vm_name . ' - ' . $initiator_name, Severity::Info, 'backup');
    }
}
