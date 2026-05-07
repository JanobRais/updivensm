<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class AlertRulesSeeder extends Seeder
{
    public function run(): void
    {
        $rules = [
            // --- Core System ---
            ['name' => 'Device Down', 'severity' => 'critical', 'query' => 'macros.device_down = 1'],
            ['name' => 'Device Rebooted', 'severity' => 'warning', 'query' => 'devices.uptime < 300 AND macros.device_up = 1'],
            ['name' => 'ICMP Response Time > 500ms', 'severity' => 'warning', 'query' => 'devices.last_ping_timetaken > 500'],
            ['name' => 'SNMP Connection Failed', 'severity' => 'critical', 'query' => 'devices.status = 0 AND devices.snmp_status = 0'],

            // --- Hardware Resources ---
            ['name' => 'High CPU Usage (>85%)', 'severity' => 'warning', 'query' => 'processors.processor_usage > 85'],
            ['name' => 'Critical CPU Usage (>95%)', 'severity' => 'critical', 'query' => 'processors.processor_usage > 95'],
            ['name' => 'High Memory Usage (>90%)', 'severity' => 'warning', 'query' => 'mempools.mempool_perc > 90'],
            ['name' => 'Storage Usage (>90%)', 'severity' => 'warning', 'query' => 'storage.storage_perc > 90'],
            ['name' => 'Critical Storage Usage (>98%)', 'severity' => 'critical', 'query' => 'storage.storage_perc > 98'],
            ['name' => 'Temperature High', 'severity' => 'critical', 'query' => 'sensors.sensor_class = "temperature" AND sensors.sensor_current > sensors.sensor_limit'],
            ['name' => 'Fan Failure', 'severity' => 'critical', 'query' => 'sensors.sensor_class = "fan" AND sensors.sensor_current = 0'],

            // --- Network Interfaces ---
            ['name' => 'Port Down (Operational)', 'severity' => 'critical', 'query' => 'ports.ifOperStatus = "down" AND ports.ifAdminStatus = "up"'],
            ['name' => 'High Port Utilization (In > 80%)', 'severity' => 'warning', 'query' => '(ports.ifInOctets_rate*8/ports.ifSpeed)*100 > 80'],
            ['name' => 'High Port Utilization (Out > 80%)', 'severity' => 'warning', 'query' => '(ports.ifOutOctets_rate*8/ports.ifSpeed)*100 > 80'],
            ['name' => 'Critical Port Utilization (In > 95%)', 'severity' => 'critical', 'query' => '(ports.ifInOctets_rate*8/ports.ifSpeed)*100 > 95'],
            ['name' => 'Critical Port Utilization (Out > 95%)', 'severity' => 'critical', 'query' => '(ports.ifOutOctets_rate*8/ports.ifSpeed)*100 > 95'],
            ['name' => 'Abnormal PPS (In > 50k pps)', 'severity' => 'warning', 'query' => 'ports.ifInUcastPkts_rate > 50000'],
            ['name' => 'Abnormal PPS (Out > 50k pps)', 'severity' => 'warning', 'query' => 'ports.ifOutUcastPkts_rate > 50000'],
            ['name' => 'Port Errors/Discards (High)', 'severity' => 'warning', 'query' => 'ports.ifInErrors_rate > 5 OR ports.ifOutErrors_rate > 5'],
            ['name' => 'Port Duplex Mismatch', 'severity' => 'warning', 'query' => 'ports.ifDuplex = "half" AND ports.ifSpeed >= 100000000'],

            // --- BGP / Routing ---
            ['name' => 'BGP Session Down', 'severity' => 'critical', 'query' => 'bgpPeers.bgpPeerState != "established"'],
            ['name' => 'OSPF Neighbor Down', 'severity' => 'critical', 'query' => 'ospf_neighbors.ospfNbrState != "full"'],

            // --- BGP Specific ---
            ['name' => 'BGP Peer Flapping', 'severity' => 'warning', 'query' => 'bgpPeers.bgpPeerFsmEstablishedTransitions > 5'],

            // --- Services ---
            ['name' => 'Service Down', 'severity' => 'critical', 'query' => 'services.service_status = 0'],
        ];

        foreach ($rules as $rule) {
            DB::table('alert_rules')->updateOrInsert(
                ['name' => $rule['name']],
                [
                    'severity'   => $rule['severity'],
                    'query'      => $rule['query'],
                    'extra'      => '[]',
                    'disabled'   => 0,
                    'proc'       => null,
                    'invert_map' => 0,
                    'builder'    => '[]'
                ]
            );
        }
    }
}
