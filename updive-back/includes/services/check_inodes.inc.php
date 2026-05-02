<?php

$check_cmd = \App\Facades\UpdiveNSMConfig::get('nagios_plugins') . '/check_inodes ' . $service['service_param'];
