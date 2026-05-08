<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class AlertRulesSeeder extends Seeder
{
    public function run(): void
    {
        // confirm_count = consecutive positive polls before firing
        // delay_min     = minutes to wait since first positive before firing
        $rules = [
            // --- Core System ---
            // Device Down: require 3 consecutive failures + 3 min delay to avoid flapping alerts
            ['name' => 'Device Down',             'severity' => 'critical', 'confirm_count' => 3, 'delay_min' => 3,  'query' => 'macros.device_down = 1'],
            ['name' => 'Device Rebooted',          'severity' => 'warning',  'confirm_count' => 1, 'delay_min' => 0,  'query' => 'devices.uptime < 300 AND macros.device_up = 1'],
            ['name' => 'ICMP Response Time > 500ms','severity' => 'warning', 'confirm_count' => 2, 'delay_min' => 0,  'query' => 'devices.last_ping_timetaken > 500'],
            // SNMP failed: require 3 consecutive failures before alerting
            ['name' => 'SNMP Connection Failed',   'severity' => 'critical', 'confirm_count' => 3, 'delay_min' => 2,  'query' => 'devices.status = 0 AND devices.snmp_status = 0'],

            // --- Hardware Resources ---
            // CPU/Memory: sustained over 2 polls to avoid spikes
            ['name' => 'High CPU Usage (>85%)',     'severity' => 'warning',  'confirm_count' => 2, 'delay_min' => 0,  'query' => 'processors.processor_usage > 85'],
            ['name' => 'Critical CPU Usage (>95%)', 'severity' => 'critical', 'confirm_count' => 2, 'delay_min' => 0,  'query' => 'processors.processor_usage > 95'],
            ['name' => 'High Memory Usage (>90%)',  'severity' => 'warning',  'confirm_count' => 2, 'delay_min' => 0,  'query' => 'mempools.mempool_perc > 90'],
            ['name' => 'Storage Usage (>90%)',      'severity' => 'warning',  'confirm_count' => 1, 'delay_min' => 0,  'query' => 'storage.storage_perc > 90'],
            ['name' => 'Critical Storage Usage (>98%)','severity' => 'critical','confirm_count'=> 1, 'delay_min' => 0,  'query' => 'storage.storage_perc > 98'],
            ['name' => 'Temperature High',          'severity' => 'critical', 'confirm_count' => 2, 'delay_min' => 0,  'query' => 'sensors.sensor_class = "temperature" AND sensors.sensor_current > sensors.sensor_limit'],
            ['name' => 'Fan Failure',               'severity' => 'critical', 'confirm_count' => 2, 'delay_min' => 0,  'query' => 'sensors.sensor_class = "fan" AND sensors.sensor_current = 0'],

            // --- Network Interfaces ---
            // Port Down: 2 confirmations + 2 min delay. Exclude flapping ports (they get own alert)
            ['name' => 'Port Down (Operational)',          'severity' => 'critical', 'confirm_count' => 2, 'delay_min' => 2,  'query' => 'ports.ifOperStatus = "down" AND ports.ifAdminStatus = "up" AND ports.flapping = 0'],
            // Port Flapping: fires as soon as poller:flap marks port as flapping
            ['name' => 'Port Flapping',                    'severity' => 'warning',  'confirm_count' => 1, 'delay_min' => 0,  'query' => 'ports.flapping = 1'],
            ['name' => 'High Port Utilization (In > 80%)', 'severity' => 'warning',  'confirm_count' => 2, 'delay_min' => 0,  'query' => '(ports.ifInOctets_rate*8/ports.ifSpeed)*100 > 80'],
            ['name' => 'High Port Utilization (Out > 80%)','severity' => 'warning',  'confirm_count' => 2, 'delay_min' => 0,  'query' => '(ports.ifOutOctets_rate*8/ports.ifSpeed)*100 > 80'],
            ['name' => 'Critical Port Utilization (In > 95%)', 'severity' => 'critical','confirm_count'=> 2,'delay_min' => 0, 'query' => '(ports.ifInOctets_rate*8/ports.ifSpeed)*100 > 95'],
            ['name' => 'Critical Port Utilization (Out > 95%)','severity' => 'critical','confirm_count'=> 2,'delay_min' => 0, 'query' => '(ports.ifOutOctets_rate*8/ports.ifSpeed)*100 > 95'],
            ['name' => 'Abnormal PPS (In > 50k pps)',      'severity' => 'warning',  'confirm_count' => 2, 'delay_min' => 0,  'query' => 'ports.ifInUcastPkts_rate > 50000'],
            ['name' => 'Abnormal PPS (Out > 50k pps)',     'severity' => 'warning',  'confirm_count' => 2, 'delay_min' => 0,  'query' => 'ports.ifOutUcastPkts_rate > 50000'],
            ['name' => 'Port Errors/Discards (High)',       'severity' => 'warning',  'confirm_count' => 2, 'delay_min' => 0,  'query' => 'ports.ifInErrors_rate > 5 OR ports.ifOutErrors_rate > 5'],
            ['name' => 'Port Duplex Mismatch',             'severity' => 'warning',  'confirm_count' => 1, 'delay_min' => 0,  'query' => 'ports.ifDuplex = "half" AND ports.ifSpeed >= 100000000'],

            // --- BGP / Routing ---
            ['name' => 'BGP Session Down',   'severity' => 'critical', 'confirm_count' => 2, 'delay_min' => 1, 'query' => 'bgpPeers.bgpPeerState != "established"'],
            ['name' => 'OSPF Neighbor Down', 'severity' => 'critical', 'confirm_count' => 2, 'delay_min' => 1, 'query' => 'ospf_neighbors.ospfNbrState != "full"'],

            // --- BGP Specific ---
            ['name' => 'BGP Peer Flapping', 'severity' => 'warning', 'confirm_count' => 1, 'delay_min' => 0, 'query' => 'bgpPeers.bgpPeerFsmEstablishedTransitions > 5'],

            // --- Services ---
            ['name' => 'Service Down', 'severity' => 'critical', 'confirm_count' => 2, 'delay_min' => 0, 'query' => 'services.service_status = 0'],
        ];

        foreach ($rules as $rule) {
            DB::table('alert_rules')->updateOrInsert(
                ['name' => $rule['name']],
                [
                    'severity'      => $rule['severity'],
                    'query'         => $rule['query'],
                    'extra'         => '[]',
                    'disabled'      => 0,
                    'proc'          => null,
                    'invert_map'    => 0,
                    'builder'       => '[]',
                    'confirm_count' => $rule['confirm_count'] ?? 1,
                    'delay_min'     => $rule['delay_min']     ?? 0,
                ]
            );
        }
    }
}
