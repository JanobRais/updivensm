<?php

// NS-ROOT-MIB::vsvrFullName."UpdiveNSM" = STRING: "UpdiveNSM"
// NS-ROOT-MIB::vsvrIpAddress."UpdiveNSM" = IpAddress: 195.78.84.141
// NS-ROOT-MIB::vsvrPort."UpdiveNSM" = INTEGER: 80
// NS-ROOT-MIB::vsvrType."UpdiveNSM" = INTEGER: http(0)
// NS-ROOT-MIB::vsvrState."UpdiveNSM" = INTEGER: up(7)
// NS-ROOT-MIB::vsvrCurClntConnections."UpdiveNSM" = Gauge32: 18
// NS-ROOT-MIB::vsvrCurSrvrConnections."UpdiveNSM" = Gauge32: 0
// NS-ROOT-MIB::vsvrSurgeCount."UpdiveNSM" = Counter32: 0
// NS-ROOT-MIB::vsvrTotalRequests."UpdiveNSM" = Counter64: 64532
// NS-ROOT-MIB::vsvrTotalRequestBytes."UpdiveNSM" = Counter64: 22223153
// NS-ROOT-MIB::vsvrTotalResponses."UpdiveNSM" = Counter64: 64496
// NS-ROOT-MIB::vsvrTotalResponseBytes."UpdiveNSM" = Counter64: 1048603453
// NS-ROOT-MIB::vsvrTotalPktsRecvd."UpdiveNSM" = Counter64: 629637
// NS-ROOT-MIB::vsvrTotalPktsSent."UpdiveNSM" = Counter64: 936237
// NS-ROOT-MIB::vsvrTotalSynsRecvd."UpdiveNSM" = Counter64: 43130
// NS-ROOT-MIB::vsvrCurServicesDown."UpdiveNSM" = Gauge32: 0
// NS-ROOT-MIB::vsvrCurServicesUnKnown."UpdiveNSM" = Gauge32: 0
// NS-ROOT-MIB::vsvrCurServicesOutOfSvc."UpdiveNSM" = Gauge32: 0
// NS-ROOT-MIB::vsvrCurServicesTransToOutOfSvc."UpdiveNSM" = Gauge32: 0
// NS-ROOT-MIB::vsvrCurServicesUp."UpdiveNSM" = Gauge32: 0
// NS-ROOT-MIB::vsvrTotMiss."UpdiveNSM" = Counter64: 0
// NS-ROOT-MIB::vsvrRequestRate."UpdiveNSM" = STRING: "0"
// NS-ROOT-MIB::vsvrRxBytesRate."UpdiveNSM" = STRING: "248"
// NS-ROOT-MIB::vsvrTxBytesRate."UpdiveNSM" = STRING: "188"
// NS-ROOT-MIB::vsvrSynfloodRate."UpdiveNSM" = STRING: "0"
// NS-ROOT-MIB::vsvrIp6Address."UpdiveNSM" = STRING: 0:0:0:0:0:0:0:0
// NS-ROOT-MIB::vsvrTotHits."UpdiveNSM" = Counter64: 64537
// NS-ROOT-MIB::vsvrTotSpillOvers."UpdiveNSM" = Counter32: 0
// NS-ROOT-MIB::vsvrTotalClients."UpdiveNSM" = Counter64: 43023
// NS-ROOT-MIB::vsvrClientConnOpenRate."UpdiveNSM" = STRING: "0"
use UpdiveNSM\RRD\RrdDefinition;

if ($device['os'] == 'netscaler') {
    $oids_gauge = [
        'vsvrCurClntConnections',
        'vsvrCurSrvrConnections',
    ];

    $oids_counter = [
        'vsvrSurgeCount',
        'vsvrTotalRequests',
        'vsvrTotalRequestBytes',
        'vsvrTotalResponses',
        'vsvrTotalResponseBytes',
        'vsvrTotalPktsRecvd',
        'vsvrTotalPktsSent',
        'vsvrTotalSynsRecvd',
        'vsvrTotMiss',
        'vsvrTotHits',
        'vsvrTotSpillOvers',
        'vsvrTotalClients',
    ];

    $oids = array_merge($oids_gauge, $oids_counter);

    $rrd_def = new RrdDefinition();
    foreach ($oids_gauge as $oid) {
        $oid_ds = str_replace('vsvr', '', $oid);
        $rrd_def->addDataset($oid_ds, 'GAUGE', null, 100000000000);
    }
    foreach ($oids_counter as $oid) {
        $oid_ds = str_replace('vsvr', '', $oid);
        $rrd_def->addDataset($oid_ds, 'COUNTER', null, 100000000000);
    }

    $vsvr_array = snmpwalk_cache_oid($device, 'vserverEntry', [], 'NS-ROOT-MIB');

    $vsvr_db = dbFetchRows('SELECT * FROM `netscaler_vservers` WHERE `device_id` = ?', [$device['device_id']]);
    foreach ($vsvr_db as $vsvr) {
        $vsvrs[$vsvr['vsvr_name']] = $vsvr;
        print_r($vsvr);
    }

    d_echo($vsvrs);

    foreach ($vsvr_array as $vsvr) {
        if (isset($vsvr['vsvrFullName'])) {
            $vsvr_exist[$vsvr['vsvrFullName']] = 1;
            $rrd_name = 'netscaler-vsvr-' . $vsvr['vsvrFullName'];

            $fields = [];
            foreach ($oids as $oid) {
                $oid_ds = str_replace('vsvr', '', $oid);
                if (is_numeric($vsvr[$oid])) {
                    $fields[$oid_ds] = $vsvr[$oid];
                } else {
                    $fields[$oid_ds] = null;
                }
            }

            $tags = [
                'vsvrFullName' => $vsvr['vsvrFullName'],
                'rrd_name' => $rrd_name,
                'rrd_def' => $rrd_def,
            ];
            app('Datastore')->put($device, 'netscaler-vsvr', $tags, $fields);

            echo str_pad($vsvr['vsvrFullName'], 25) . ' | ' . str_pad((string) $vsvr['vsvrType'], 5) . ' | ' . str_pad((string) $vsvr['vsvrState'], 6) . ' | ' . str_pad((string) $vsvr['vsvrIpAddress'], 16) . ' | ' . str_pad((string) $vsvr['vsvrPort'], 5);
            echo ' | ' . str_pad((string) $vsvr['vsvrRequestRate'], 8) . ' | ' . str_pad($vsvr['vsvrRxBytesRate'] . 'B/s', 8) . ' | ' . str_pad($vsvr['vsvrTxBytesRate'] . 'B/s', 8);

            $db_update = [
                'vsvr_ip' => $vsvr['vsvrIpAddress'],
                'vsvr_port' => $vsvr['vsvrPort'],
                'vsvr_state' => $vsvr['vsvrState'],
                'vsvr_type' => $vsvr['vsvrType'],
                'vsvr_req_rate' => $vsvr['vsvrRequestRate'] ?? 0,
                'vsvr_bps_in' => $vsvr['vsvrRxBytesRate'] ?? 0,
                'vsvr_bps_out' => $vsvr['vsvrTxBytesRate'] ?? 0,
            ];

            if (! is_array($vsvrs[$vsvr['vsvrFullName']])) {
                $db_insert = array_merge(['device_id' => $device['device_id'], 'vsvr_name' => $vsvr['vsvrFullName']], $db_update);
                $vsvr_id = dbInsert($db_insert, 'netscaler_vservers');
                echo ' +';
            } else {
                $updated = dbUpdate($db_update, 'netscaler_vservers', '`vsvr_id` = ?', [$vsvrs[$vsvr['vsvrFullName']]['vsvr_id']]);
                echo ' U';
            }

            echo "\n";
        }//end if
    }//end foreach

    d_echo($vsvr_exist);

    foreach ($vsvrs as $db_name => $db_id) {
        if (! $vsvr_exist[$db_name]) {
            echo '-' . $db_name;
            \App\Models\NetscalerVserver::where('vsvr_id', $db_id['vsvr_id'])->delete();
        }
    }
}//end if
