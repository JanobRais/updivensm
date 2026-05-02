<?php

$check_cmd = 'sudo ' . \App\Facades\UpdiveNSMConfig::get('nagios_plugins') . '/check_mailqueue ' . $service['service_param'];
