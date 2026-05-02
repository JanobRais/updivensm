<?php

namespace UpdiveNSM\Interfaces\Polling\Netstats;

interface SnmpNetstatsPolling
{
    public function pollSnmpNetstats(array $oids): array;
}
