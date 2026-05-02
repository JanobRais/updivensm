<?php

$check_cmd = 'sudo ' . \App\Facades\UpdiveNSMConfig::get('nagios_plugins') . '/check_postfix ' . $service['service_param'];
