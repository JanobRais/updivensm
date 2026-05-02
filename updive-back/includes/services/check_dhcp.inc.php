<?php

$check_cmd = \App\Facades\UpdiveNSMConfig::get('nagios_plugins') . '/check_dhcp ' . $service['service_param'];
