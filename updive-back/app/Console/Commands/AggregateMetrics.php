<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AggregateMetrics extends Command
{
    protected $signature   = 'metrics:aggregate';
    protected $description = 'Aggregate old raw metrics into hourly and daily summaries';

    // Raw rows older than this → collapse into 1h rows
    private int $rawKeepHours  = 2;

    // 1h rows older than this → collapse into 1d rows
    private int $hourKeepDays  = 2;

    // 1d rows older than this → delete
    private int $dayKeepDays   = 365;

    public function handle(): int
    {
        $now = now();

        [$raw1h, $raw1hDeleted] = $this->aggregateRawToHourly($now);
        [$h1d,   $h1dDeleted]   = $this->aggregateHourlyToDaily($now);
        $pruned                  = $this->pruneOldDaily($now);

        $this->info(sprintf(
            'Aggregate: raw→1h inserted=%d deleted=%d | 1h→1d inserted=%d deleted=%d | 1d pruned=%d',
            $raw1h, $raw1hDeleted, $h1d, $h1dDeleted, $pruned
        ));

        return self::SUCCESS;
    }

    private function aggregateRawToHourly(\Carbon\Carbon $now): array
    {
        $cutoff = $now->copy()->subHours($this->rawKeepHours);

        // Build hourly averages from raw rows older than cutoff
        $rows = DB::select("
            SELECT device_id, metric_type, object_id, object_name, unit,
                   DATE_FORMAT(collected_at, '%Y-%m-%d %H:00:00') AS bucket,
                   AVG(value) AS avg_val,
                   MIN(value) AS min_val,
                   MAX(value) AS max_val,
                   COUNT(*)   AS cnt
            FROM updive_metrics
            WHERE resolution = 'raw'
              AND collected_at < ?
            GROUP BY device_id, metric_type, object_id, object_name, unit,
                     DATE_FORMAT(collected_at, '%Y-%m-%d %H:00:00')
        ", [$cutoff]);

        if (empty($rows)) {
            return [0, 0];
        }

        $inserts = array_map(fn ($r) => [
            'device_id'   => $r->device_id,
            'metric_type' => $r->metric_type,
            'object_id'   => $r->object_id,
            'object_name' => $r->object_name,
            'value'       => $r->avg_val,
            'unit'        => $r->unit,
            'collected_at'=> $r->bucket,
            'resolution'  => '1h',
        ], $rows);

        foreach (array_chunk($inserts, 500) as $chunk) {
            DB::table('updive_metrics')->insert($chunk);
        }

        $deleted = DB::table('updive_metrics')
            ->where('resolution', 'raw')
            ->where('collected_at', '<', $cutoff)
            ->delete();

        return [count($inserts), $deleted];
    }

    private function aggregateHourlyToDaily(\Carbon\Carbon $now): array
    {
        $cutoff = $now->copy()->subDays($this->hourKeepDays);

        $rows = DB::select("
            SELECT device_id, metric_type, object_id, object_name, unit,
                   DATE_FORMAT(collected_at, '%Y-%m-%d 00:00:00') AS bucket,
                   AVG(value) AS avg_val,
                   MIN(value) AS min_val,
                   MAX(value) AS max_val
            FROM updive_metrics
            WHERE resolution = '1h'
              AND collected_at < ?
            GROUP BY device_id, metric_type, object_id, object_name, unit,
                     DATE_FORMAT(collected_at, '%Y-%m-%d 00:00:00')
        ", [$cutoff]);

        if (empty($rows)) {
            return [0, 0];
        }

        $inserts = array_map(fn ($r) => [
            'device_id'   => $r->device_id,
            'metric_type' => $r->metric_type,
            'object_id'   => $r->object_id,
            'object_name' => $r->object_name,
            'value'       => $r->avg_val,
            'unit'        => $r->unit,
            'collected_at'=> $r->bucket,
            'resolution'  => '1d',
        ], $rows);

        foreach (array_chunk($inserts, 500) as $chunk) {
            DB::table('updive_metrics')->insert($chunk);
        }

        $deleted = DB::table('updive_metrics')
            ->where('resolution', '1h')
            ->where('collected_at', '<', $cutoff)
            ->delete();

        return [count($inserts), $deleted];
    }

    private function pruneOldDaily(\Carbon\Carbon $now): int
    {
        return DB::table('updive_metrics')
            ->where('resolution', '1d')
            ->where('collected_at', '<', $now->copy()->subDays($this->dayKeepDays))
            ->delete();
    }
}
