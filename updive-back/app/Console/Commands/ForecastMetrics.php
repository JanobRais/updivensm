<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ForecastMetrics extends Command
{
    protected $signature   = 'metrics:forecast';
    protected $description = 'Predict when port traffic will reach capacity using linear regression';

    public function handle(): int
    {
        $this->forecastPorts();
        $this->forecastCpu();
        $this->info('Forecasts updated.');
        return 0;
    }

    private function forecastPorts(): void
    {
        // Get all ports with ifSpeed, grouped by device
        $ports = DB::table('ports')
            ->join('devices', 'devices.device_id', '=', 'ports.device_id')
            ->whereNotNull('ports.ifSpeed')
            ->where('ports.ifSpeed', '>', 0)
            ->where('devices.ignore', 0)
            ->where('devices.disabled', 0)
            ->select('ports.port_id', 'ports.ifDescr', 'ports.device_id', 'ports.ifSpeed')
            ->get();

        foreach ($ports as $port) {
            foreach (['port_in', 'port_out'] as $type) {
                $this->forecastSeries(
                    $port->device_id,
                    $port->port_id,
                    $port->ifDescr ?? "port_{$port->port_id}",
                    $type,
                    $port->ifSpeed / 8 // convert bps → bytes/s
                );
            }
        }
    }

    private function forecastCpu(): void
    {
        $devices = DB::table('devices')
            ->where('ignore', 0)->where('disabled', 0)
            ->pluck('device_id');

        foreach ($devices as $deviceId) {
            // CPU: limit = 90% threshold
            $cpuObjects = DB::table('updive_metrics')
                ->where('device_id', $deviceId)
                ->where('metric_type', 'cpu')
                ->distinct()
                ->pluck('object_id');

            foreach ($cpuObjects as $objId) {
                $this->forecastSeries($deviceId, $objId, "CPU {$objId}", 'cpu', 90);
            }
        }
    }

    private function forecastSeries(
        int $deviceId, int $objectId, string $objectName,
        string $metricType, float $limitValue
    ): void {
        // Get last 7 days of hourly data, ordered by time
        $points = DB::table('updive_metrics')
            ->where('device_id', $deviceId)
            ->where('object_id', $objectId)
            ->where('metric_type', $metricType)
            ->where('resolution', '1h')
            ->where('collected_at', '>=', now()->subDays(7))
            ->orderBy('collected_at')
            ->select(DB::raw('UNIX_TIMESTAMP(collected_at) as ts, value'))
            ->get();

        if ($points->count() < 6) {
            return; // not enough data
        }

        [$slope, $intercept, $r2] = $this->linearRegression($points);

        $currentValue = $points->last()->value;

        // days_until_limit: how many hours until value hits limit
        $daysUntilLimit = null;
        if ($slope > 0 && $currentValue < $limitValue) {
            $hoursRemaining  = ($limitValue - $currentValue) / $slope;
            $daysUntilLimit  = round($hoursRemaining / 24, 1);
            if ($daysUntilLimit > 365) {
                $daysUntilLimit = null; // too far in future, not useful
            }
        }

        DB::table('metric_forecasts')->upsert([
            'device_id'       => $deviceId,
            'object_id'       => $objectId,
            'object_name'     => $objectName,
            'metric_type'     => $metricType,
            'current_value'   => $currentValue,
            'limit_value'     => $limitValue,
            'slope_per_hour'  => $slope,
            'r_squared'       => $r2,
            'days_until_limit'=> $daysUntilLimit,
            'updated_at'      => now(),
        ], ['device_id', 'object_id', 'metric_type'],
           ['current_value', 'slope_per_hour', 'r_squared', 'days_until_limit', 'updated_at']);
    }

    private function linearRegression($points): array
    {
        $n   = $points->count();
        $xs  = $points->pluck('ts')->toArray();
        $ys  = $points->pluck('value')->toArray();

        // Normalise x to hours from first point
        $x0  = $xs[0];
        $xs  = array_map(fn ($x) => ($x - $x0) / 3600, $xs);

        $sumX  = array_sum($xs);
        $sumY  = array_sum($ys);
        $sumXY = 0;
        $sumX2 = 0;

        for ($i = 0; $i < $n; $i++) {
            $sumXY += $xs[$i] * $ys[$i];
            $sumX2 += $xs[$i] ** 2;
        }

        $denom = ($n * $sumX2 - $sumX ** 2);
        if ($denom == 0) {
            return [0, $sumY / $n, 0];
        }

        $slope     = ($n * $sumXY - $sumX * $sumY) / $denom;
        $intercept = ($sumY - $slope * $sumX) / $n;

        // R²
        $yMean  = $sumY / $n;
        $ssTot  = array_sum(array_map(fn ($y) => ($y - $yMean) ** 2, $ys));
        $ssRes  = 0;
        for ($i = 0; $i < $n; $i++) {
            $ssRes += ($ys[$i] - ($slope * $xs[$i] + $intercept)) ** 2;
        }
        $r2 = $ssTot > 0 ? max(0, 1 - $ssRes / $ssTot) : 0;

        return [$slope, $intercept, round($r2, 3)];
    }
}
