<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BuildBaselines extends Command
{
    protected $signature   = 'metrics:baseline';
    protected $description = 'Build per-device hourly baseline (avg ± σ) from updive_metrics';

    public function handle(): int
    {
        // For each (device_id, metric_type, object_id, hour_of_week) group,
        // calculate AVG and STDDEV from the last 4 weeks of hourly-aggregated data.
        $rows = DB::select("
            SELECT
                device_id,
                metric_type,
                object_id,
                (WEEKDAY(collected_at) * 24 + HOUR(collected_at)) AS hour_of_week,
                AVG(value)    AS avg_value,
                IFNULL(STDDEV_POP(value), 0) AS stddev,
                COUNT(*)      AS sample_count
            FROM updive_metrics
            WHERE resolution IN ('1h', 'raw')
              AND collected_at >= NOW() - INTERVAL 28 DAY
            GROUP BY device_id, metric_type, object_id, hour_of_week
        ");

        if (empty($rows)) {
            $this->line('No metrics data yet — skipping baseline build.');
            return 0;
        }

        $upsert = array_map(fn ($r) => [
            'device_id'    => $r->device_id,
            'metric_type'  => $r->metric_type,
            'object_id'    => $r->object_id,
            'hour_of_week' => $r->hour_of_week,
            'avg_value'    => $r->avg_value,
            'stddev'       => $r->stddev,
            'sample_count' => $r->sample_count,
            'updated_at'   => now(),
        ], $rows);

        foreach (array_chunk($upsert, 500) as $chunk) {
            DB::table('anomaly_baselines')->upsert(
                $chunk,
                ['device_id', 'metric_type', 'object_id', 'hour_of_week'],
                ['avg_value', 'stddev', 'sample_count', 'updated_at']
            );
        }

        $this->info('Baselines updated: ' . count($rows) . ' entries.');
        return 0;
    }
}
