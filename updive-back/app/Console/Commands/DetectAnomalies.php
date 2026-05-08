<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class DetectAnomalies extends Command
{
    protected $signature   = 'metrics:anomaly';
    protected $description = 'Detect anomalies by comparing latest metrics to baselines';

    private float $sigmaThreshold = 2.5; // alert if value > avg + N*stddev
    private int   $minSamples     = 6;   // ignore baselines with too few samples

    public function handle(): int
    {
        $nowHour = (int) now()->format('N') - 1; // 0=Mon
        $nowHour = $nowHour * 24 + (int) now()->format('G');

        // Latest raw metric per device/type/object
        $latest = DB::select("
            SELECT m.device_id, m.metric_type, m.object_id, m.object_name,
                   m.value, m.unit, d.hostname, d.sysName
            FROM updive_metrics m
            JOIN devices d ON d.device_id = m.device_id
            WHERE m.resolution = 'raw'
              AND m.collected_at >= NOW() - INTERVAL 10 MINUTE
              AND d.ignore = 0 AND d.disabled = 0
        ");

        if (empty($latest)) {
            return 0;
        }

        // Build baseline lookup: key = device_id:metric_type:object_id:hour
        $deviceIds = array_unique(array_column($latest, 'device_id'));
        $baselines = DB::table('anomaly_baselines')
            ->whereIn('device_id', $deviceIds)
            ->where('hour_of_week', $nowHour)
            ->where('sample_count', '>=', $this->minSamples)
            ->get()
            ->keyBy(fn ($b) => "{$b->device_id}:{$b->metric_type}:{$b->object_id}");

        $anomalies = 0;
        foreach ($latest as $m) {
            $key      = "{$m->device_id}:{$m->metric_type}:{$m->object_id}";
            $baseline = $baselines->get($key);

            if (! $baseline) {
                continue; // no baseline yet
            }

            $upper = $baseline->avg_value + ($this->sigmaThreshold * max($baseline->stddev, 1));
            $lower = $baseline->avg_value - ($this->sigmaThreshold * max($baseline->stddev, 1));

            if ($m->value > $upper || ($m->value < $lower && $lower > 0)) {
                $this->fireAnomaly($m, $baseline, $m->value > $upper ? 'high' : 'low');
                $anomalies++;
            }
        }

        if ($anomalies > 0) {
            $this->info("Anomalies detected: {$anomalies}");
        }

        return 0;
    }

    private function fireAnomaly(object $m, object $baseline, string $direction): void
    {
        $name    = $m->object_name ?: $m->metric_type;
        $host    = $m->sysName ?: $m->hostname;
        $dir     = $direction === 'high' ? 'yuqori' : 'past';
        $percent = $baseline->avg_value > 0
            ? round(abs($m->value - $baseline->avg_value) / $baseline->avg_value * 100)
            : 0;

        $message = "[Anomaly] {$host} — {$name}: qiymat normaldan {$percent}% {$dir} "
                 . "(joriy: " . round($m->value, 2)
                 . ", normal: " . round($baseline->avg_value, 2) . ")";

        // Check if same anomaly was logged in last 30 min to avoid spam
        $exists = DB::table('eventlog')
            ->where('device_id', $m->device_id)
            ->where('message', 'like', "%[Anomaly]%{$name}%")
            ->where('datetime', '>=', now()->subMinutes(30))
            ->exists();

        if (! $exists) {
            DB::table('eventlog')->insert([
                'device_id' => $m->device_id,
                'datetime'  => now(),
                'message'   => $message,
                'type'      => 'anomaly',
                'severity'  => 4, // warning
                'username'  => 'system',
                'reference' => $m->metric_type,
            ]);
        }
    }
}
