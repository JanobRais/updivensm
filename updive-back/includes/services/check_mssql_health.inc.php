<?php

$check_cmd = \App\Facades\UpdiveNSMConfig::get('nagios_plugins') . '/check_mssql_health --server ';

if ($service['service_ip']) {
    $check_cmd .= $service['service_ip'];
} else {
    $check_cmd .= $service['hostname'];
}
$check_cmd .= ' ' . $service['service_param'];
