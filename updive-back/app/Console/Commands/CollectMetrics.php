<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CollectMetrics extends Command
{
    protected $signature   = 'metrics:collect {--prune=90 : Days of history to keep}';
    protected $description = 'Snapshot current device metrics into updive_metrics table';

    public function handle(): int
    {
        $now  = now();
        $rows = [];

        // ── Ports: in/out byte rates ──────────────────────────────────────
        $ports = DB::table('ports')
            ->select('device_id', 'port_id', 'ifName', 'ifInOctets_rate', 'ifOutOctets_rate')
            ->whereNotNull('ifInOctets_rate')
            ->get();

        foreach ($ports as $p) {
            $rows[] = ['device_id' => $p->device_id, 'metric_type' => 'port_in',  'object_id' => $p->port_id, 'object_name' => $p->ifName, 'value' => $p->ifInOctets_rate,  'unit' => 'Bps', 'collected_at' => $now];
            $rows[] = ['device_id' => $p->device_id, 'metric_type' => 'port_out', 'object_id' => $p->port_id, 'object_name' => $p->ifName, 'value' => $p->ifOutOctets_rate ?? 0, 'unit' => 'Bps', 'collected_at' => $now];
        }

        // ── CPU ───────────────────────────────────────────────────────────
        $procs = DB::table('processors')
            ->select('device_id', 'processor_id', 'processor_descr', 'processor_usage')
            ->whereNotNull('processor_usage')
            ->get();

        foreach ($procs as $p) {
            $rows[] = ['device_id' => $p->device_id, 'metric_type' => 'cpu', 'object_id' => $p->processor_id, 'object_name' => $p->processor_descr, 'value' => $p->processor_usage, 'unit' => '%', 'collected_at' => $now];
        }

        // ── Memory ────────────────────────────────────────────────────────
        $mems = DB::table('mempools')
            ->select('device_id', 'mempool_id', 'mempool_descr', 'mempool_perc')
            ->where('mempool_deleted', 0)
            ->whereNotNull('mempool_perc')
            ->get();

        foreach ($mems as $m) {
            $rows[] = ['device_id' => $m->device_id, 'metric_type' => 'mem', 'object_id' => $m->mempool_id, 'object_name' => $m->mempool_descr, 'value' => $m->mempool_perc, 'unit' => '%', 'collected_at' => $now];
        }

        // ── Uptime ────────────────────────────────────────────────────────
        $devs = DB::table('devices')
            ->select('device_id', 'uptime')
            ->where('status', 1)
            ->whereNotNull('uptime')
            ->get();

        foreach ($devs as $d) {
            $rows[] = ['device_id' => $d->device_id, 'metric_type' => 'uptime', 'object_id' => $d->device_id, 'object_name' => null, 'value' => $d->uptime, 'unit' => 's', 'collected_at' => $now];
        }

        // ── Bulk insert ───────────────────────────────────────────────────
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('updive_metrics')->insert($chunk);
        }

        // ── Prune old rows ────────────────────────────────────────────────
        $days    = (int) $this->option('prune');
        $deleted = DB::table('updive_metrics')
            ->where('collected_at', '<', now()->subDays($days))
            ->delete();

        $this->info(sprintf(
            'Collected %d metrics — pruned %d rows older than %d days.',
            count($rows), $deleted, $days
        ));

        return self::SUCCESS;
    }
}
