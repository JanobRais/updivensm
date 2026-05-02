<?php

$check_cmd = \App\Facades\UpdiveNSMConfig::get('nagios_plugins') . '/check_hetzner_storagebox ' . $service['service_param'];
