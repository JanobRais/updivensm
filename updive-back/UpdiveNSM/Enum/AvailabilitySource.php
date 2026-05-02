<?php

namespace UpdiveNSM\Enum;

enum AvailabilitySource: string
{
    case None = '';
    case Snmp = 'snmp';
    case Icmp = 'icmp';
}
