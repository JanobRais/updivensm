<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class PartitionMetrics extends Command
{
    protected $signature   = 'metrics:partition {--months=3 : How many future months to pre-create}';
    protected $description = 'Manage MySQL monthly partitions on updive_metrics table';

    public function handle(): int
    {
        if (! $this->tableIsPartitioned()) {
            $this->info('Table not partitioned yet — initialising...');
            $this->initialisePartitions();
            $this->info('Partitioning complete.');
            return 0;
        }

        $this->ensureFuturePartitions((int) $this->option('months'));
        $this->dropOldPartitions();
        $this->info('Partition maintenance done.');
        return 0;
    }

    private function tableIsPartitioned(): bool
    {
        $row = DB::selectOne("
            SELECT COUNT(*) AS cnt
            FROM information_schema.PARTITIONS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'updive_metrics'
              AND PARTITION_NAME IS NOT NULL
        ");
        return (int) ($row->cnt ?? 0) > 0;
    }

    private function initialisePartitions(): void
    {
        // MySQL requires the partition key to be part of all unique/primary indexes.
        // Modify PK from (id) to (id, collected_at) before partitioning.
        DB::statement("ALTER TABLE updive_metrics DROP PRIMARY KEY, ADD PRIMARY KEY (id, collected_at)");

        // Build partitions: 6 past months + future months + MAXVALUE catch-all
        $parts = [];
        $start = now()->subMonths(6)->startOfMonth();
        $end   = now()->addMonths((int) $this->option('months') + 1)->startOfMonth();

        for ($m = $start->copy(); $m->lt($end); $m->addMonth()) {
            $name    = 'p' . $m->format('Y_m');
            $less    = $m->copy()->addMonth()->format('Y-m-d');
            $parts[] = "PARTITION {$name} VALUES LESS THAN (UNIX_TIMESTAMP('{$less}'))";
        }
        $parts[] = "PARTITION p_future VALUES LESS THAN MAXVALUE";

        $sql = "ALTER TABLE updive_metrics PARTITION BY RANGE (UNIX_TIMESTAMP(collected_at)) (\n"
             . implode(",\n", $parts) . "\n)";

        DB::statement($sql);
    }

    private function ensureFuturePartitions(int $months): void
    {
        // Find the last real (non-future) partition boundary
        $rows = DB::select("
            SELECT PARTITION_NAME, PARTITION_DESCRIPTION
            FROM information_schema.PARTITIONS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'updive_metrics'
              AND PARTITION_NAME != 'p_future'
            ORDER BY PARTITION_ORDINAL_POSITION DESC
            LIMIT 1
        ");

        if (empty($rows)) {
            return;
        }

        $lastTs  = (int) $rows[0]->PARTITION_DESCRIPTION;
        $lastEnd = \Carbon\Carbon::createFromTimestamp($lastTs);
        $target  = now()->addMonths($months)->startOfMonth()->addMonth();

        if ($lastEnd->gte($target)) {
            return; // already enough future partitions
        }

        // Reorganise p_future into new monthly partitions
        $parts = [];
        for ($m = $lastEnd->copy(); $m->lt($target); $m->addMonth()) {
            $name   = 'p' . $m->format('Y_m');
            $less   = $m->copy()->addMonth()->format('Y-m-d');
            $parts[] = "PARTITION {$name} VALUES LESS THAN (UNIX_TIMESTAMP('{$less}'))";
            $this->line("  + {$name}");
        }
        $parts[] = "PARTITION p_future VALUES LESS THAN MAXVALUE";

        DB::statement("ALTER TABLE updive_metrics REORGANIZE PARTITION p_future INTO (\n"
            . implode(",\n", $parts) . "\n)");
    }

    private function dropOldPartitions(): void
    {
        // Drop partitions older than 13 months
        $cutoff = now()->subMonths(13)->startOfMonth();

        $rows = DB::select("
            SELECT PARTITION_NAME, PARTITION_DESCRIPTION
            FROM information_schema.PARTITIONS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'updive_metrics'
              AND PARTITION_NAME NOT IN ('p_future')
            ORDER BY PARTITION_ORDINAL_POSITION ASC
        ");

        foreach ($rows as $row) {
            $partEnd = \Carbon\Carbon::createFromTimestamp((int) $row->PARTITION_DESCRIPTION);
            if ($partEnd->lte($cutoff)) {
                DB::statement("ALTER TABLE updive_metrics DROP PARTITION {$row->PARTITION_NAME}");
                $this->line("  - dropped {$row->PARTITION_NAME}");
            }
        }
    }
}
