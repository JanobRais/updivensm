<?php

$check_cmd = \App\Facades\UpdiveNSMConfig::get('nagios_plugins') . '/check_procs ' . $service['service_param'];
