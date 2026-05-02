<?php

$check_cmd = \App\Facades\UpdiveNSMConfig::get('nagios_plugins') . '/check_haproxy ' . $service['service_param'];
