<?php

use App\Console\Commands\MaintenanceCleanupNetworks;
use App\Console\Commands\MaintenanceCleanupSyslog;
use App\Console\Commands\MaintenanceDiscoverSslCertificates;
use App\Console\Commands\MaintenanceFetchOuis;
use App\Console\Commands\MaintenanceFetchRSS;
use App\Console\Commands\MaintenanceRefreshSslCertificates;
use App\Facades\UpdiveNSMConfig;
use App\Jobs\PingCheck;
use App\Models\Eventlog;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schedule;
use UpdiveNSM\Enum\Severity;
use UpdiveNSM\Util\Time;
use Symfony\Component\Process\Process;

/*
|--------------------------------------------------------------------------
| Console Routes
|--------------------------------------------------------------------------
|
| This file is where you may define all of your Closure based console
| commands. Each Closure is bound to a command instance allowing a
| simple approach to interacting with each command's IO methods.
|
*/

Artisan::command('device:rename
    {old hostname : ' . __('The existing hostname, IP, or device id') . '}
    {new hostname : ' . __('The new hostname or IP') . '}
', function (): void {
    /** @var Illuminate\Console\Command $this */
    (new Process([
        base_path('renamehost.php'),
        $this->argument('old hostname'),
        $this->argument('new hostname'),
    ]))->setTimeout(null)->setIdleTimeout(null)->setTty(Process::isTtySupported())->run();
})->purpose(__('Rename a device, this can be used to change the hostname or IP of a device'));

Artisan::command('update', function (): void {
    (new Process([base_path('daily.sh')]))->setTimeout(null)->setIdleTimeout(null)->setTty(Process::isTtySupported())->run();
})->purpose(__('Update UpdiveNSM and run maintenance routines'));

Artisan::command('poller:ping
    {groups?* : ' . __('Optional List of distributed poller groups to poll') . '}
', function (): void {
    PingCheck::dispatch($this->argument('groups'));
})->purpose(__('Check if devices are up or down via icmp'));

Artisan::command('poller:alerts', function (): void {
    $rules   = \DB::table('alert_rules')->where('disabled', 0)->get();
    $devices = \DB::table('devices')->where('ignore', 0)->get()->keyBy('device_id');
    $fired   = 0;
    $cleared = 0;
    $now     = now();

    // Table → join definition for building WHERE queries
    $tableMap = [
        'devices'    => ['join' => null],
        'ports'      => ['join' => 'devices.device_id = ports.device_id'],
        'processors' => ['join' => 'devices.device_id = processors.device_id'],
        'mempools'   => ['join' => 'devices.device_id = mempools.device_id'],
    ];

    foreach ($rules as $rule) {
        $query        = $rule->query ?? '';
        $confirmCount = max(1, (int) ($rule->confirm_count ?? 1));
        $delayMin     = max(0, (int) ($rule->delay_min     ?? 0));

        // Detect primary table from query
        preg_match_all('/(\w+)\.\w+/', $query, $m);
        $tables = array_unique($m[1] ?? []);

        if (in_array('macros', $tables)) continue;

        $primaryTable = collect($tables)->first(fn ($t) => isset($tableMap[$t]));
        if (! $primaryTable) continue;

        // Strip table prefixes for raw WHERE (ports.ifOperStatus → ifOperStatus)
        $where = preg_replace('/\b\w+\.(\w+)\b/', '$1', $query);
        if (! $where) continue;
        $where = str_replace(['\\"', '"'], ["'", "'"], $where);
        if (empty($where)) continue;

        // Evaluate rule condition against all active devices
        try {
            if ($primaryTable === 'devices') {
                $matchingDevices = \DB::table('devices')
                    ->select('device_id')
                    ->where('ignore', 0)
                    ->whereRaw($where)
                    ->get();
            } else {
                [$left, $right] = explode(' = ', $tableMap[$primaryTable]['join']);
                $matchingDevices = \DB::table('devices')
                    ->select('devices.device_id')
                    ->where('devices.ignore', 0)
                    ->join($primaryTable, trim($left), '=', trim($right))
                    ->whereRaw($where)
                    ->get();
            }
        } catch (\Exception) {
            continue;
        }

        $matchingIds = $matchingDevices->pluck('device_id')->unique()->values();

        // Load all non-cleared alerts for this rule (-1=pending, 1/2/3=active)
        $existingAlerts = \DB::table('alerts')
            ->where('rule_id', $rule->id)
            ->whereIn('state', [-1, 1, 2, 3])
            ->get()
            ->keyBy('device_id');

        // ── Condition TRUE: advance pending → fire ───────────────────────────
        foreach ($matchingIds as $deviceId) {
            if (! isset($devices[$deviceId])) continue;

            $alert = $existingAlerts->get($deviceId);

            // Already actively firing — nothing to do
            if ($alert && in_array($alert->state, [1, 2, 3])) continue;

            if ($alert && $alert->state === -1) {
                // Accumulate consecutive confirmations
                $newCount   = (int) $alert->pending_count + 1;
                $lastChange = \Carbon\Carbon::parse($alert->last_change);
                $readyCount = $newCount >= $confirmCount;
                $readyDelay = $delayMin === 0 || $now->diffInMinutes($lastChange) >= $delayMin;

                if ($readyCount && $readyDelay) {
                    \DB::table('alerts')
                        ->where('rule_id', $rule->id)
                        ->where('device_id', $deviceId)
                        ->update(['state' => 1, 'open' => 1, 'alerted' => 0,
                                  'pending_count' => $newCount]);
                    \DB::table('alert_log')->insert([
                        'rule_id'    => $rule->id,
                        'device_id'  => $deviceId,
                        'state'      => 1,
                        'details'    => json_encode([
                            'rule'    => $rule->name,
                            'confirms'=> $newCount,
                            'delay'   => $delayMin,
                        ]),
                        'time_logged' => $now,
                    ]);
                    $fired++;
                } else {
                    // Not ready yet — just bump the counter
                    \DB::table('alerts')
                        ->where('rule_id', $rule->id)
                        ->where('device_id', $deviceId)
                        ->update(['pending_count' => $newCount]);
                }
            } else {
                // First detection — enter pending state (or fire immediately if no threshold)
                $immediatelyFire = ($confirmCount <= 1 && $delayMin <= 0);
                $newState        = $immediatelyFire ? 1 : -1;

                \DB::table('alerts')->updateOrInsert(
                    ['rule_id' => $rule->id, 'device_id' => $deviceId],
                    [
                        'state'         => $newState,
                        'open'          => $immediatelyFire ? 1 : 0,
                        'alerted'       => 0,
                        'note'          => '',
                        'info'          => json_encode([]),
                        'pending_count' => 1,
                        'last_change'   => $now,
                    ]
                );

                if ($immediatelyFire) {
                    \DB::table('alert_log')->insert([
                        'rule_id'    => $rule->id,
                        'device_id'  => $deviceId,
                        'state'      => 1,
                        'details'    => json_encode(['rule' => $rule->name]),
                        'time_logged' => $now,
                    ]);
                    $fired++;
                }
            }
        }

        // ── Condition FALSE: clear active or reset pending ───────────────────
        foreach ($existingAlerts as $deviceId => $alert) {
            if ($matchingIds->contains($deviceId)) continue;

            $wasActive = in_array($alert->state, [1, 2, 3]);

            \DB::table('alerts')
                ->where('rule_id', $rule->id)
                ->where('device_id', $deviceId)
                ->update(['state' => 0, 'open' => 0, 'pending_count' => 0]);

            if ($wasActive) {
                \DB::table('alert_log')->insert([
                    'rule_id'    => $rule->id,
                    'device_id'  => $deviceId,
                    'state'      => 0,
                    'details'    => json_encode(['rule' => $rule->name, 'cleared' => true]),
                    'time_logged' => $now,
                ]);
                $cleared++;
            }
        }
    }

    $this->info("Alerts: {$fired} fired, {$cleared} cleared.");
})->purpose(__('Check for any pending alerts and deliver them via defined transports'));

Artisan::command('poller:billing
    {bill id? : ' . __('The bill id to poll') . '}
', function (): void {
    /** @var Illuminate\Console\Command $this */
    $command = [base_path('poll-billing.php')];
    if ($this->argument('bill id')) {
        $command[] = '-b';
        $command[] = $this->argument('bill id');
    }

    if (($verbosity = $this->getOutput()->getVerbosity()) >= 128) {
        $command[] = '-d';
        if ($verbosity >= 256) {
            $command[] = '-v';
        }
    }
    (new Process($command))->setTimeout(null)->setIdleTimeout(null)->setTty(Process::isTtySupported())->run();
})->purpose(__('Collect billing data'));

Artisan::command('poller:services
    {device spec : ' . __('Device spec to poll: device_id, hostname, wildcard, all') . '}
    {--x|no-data : ' . __('Do not update datastores (RRD, InfluxDB, etc)') . '}
', function (): void {
    /** @var Illuminate\Console\Command $this */
    $command = [base_path('check-services.php')];
    if ($this->option('no-data')) {
        array_push($command, '-r', '-f', '-p');
    }
    if ($this->argument('device spec') !== 'all') {
        $command[] = '-h';
        $command[] = $this->argument('device spec');
    }

    if (($verbosity = $this->getOutput()->getVerbosity()) >= 128) {
        $command[] = '-d';
        if ($verbosity >= 256) {
            $command[] = '-v';
        }
    }
    (new Process($command))->setTimeout(null)->setIdleTimeout(null)->setTty(Process::isTtySupported())->run();
})->purpose(__('Update UpdiveNSM and run maintenance routines'));

Artisan::command('poller:billing-calculate
    {--c|clear-history : ' . __('Delete all billing history') . '}
', function (): void {
    /** @var Illuminate\Console\Command $this */
    $command = [base_path('billing-calculate.php')];
    if ($this->option('clear-history')) {
        $command[] = '-r';
    }

    (new Process($command))->setTimeout(null)->setIdleTimeout(null)->setTty(Process::isTtySupported())->run();
})->purpose(__('Run billing calculations'));

Artisan::command('scan
    {network?* : ' . __('CIDR notation network(s) to scan, can be ommited if \'nets\' config is set') . '}
    {--P|ping-only : ' . __('Add the device as a ping only device if it replies to ping but not SNMP') . '}
    {--o|dns-only : ' . __('Only DNS resolved Devices') . '}
    {--t|threads=32 : ' . __('How many IPs to scan at a time, more will increase the scan speed, but could overload your system') . '}
    {--l|legend : ' . __('Print the legend') . '}
', function () {
    /** @var Illuminate\Console\Command $this */
    $command = [base_path('snmp-scan.py')];

    if (empty($this->argument('network')) && ! UpdiveNSMConfig::has('nets')) {
        $this->error(__('Network is required if \'nets\' is not set in the config'));

        return 1;
    }

    if ($this->option('dns-only')) {
        $command[] = '-o';
    }

    if ($this->option('ping-only')) {
        $command[] = '-P';
    }

    $command[] = '-t';
    $command[] = $this->option('threads');

    if ($this->option('legend')) {
        $command[] = '-l';
    }

    $verbosity = $this->getOutput()->getVerbosity();
    if ($verbosity >= 64) {
        $command[] = '-v';
        if ($verbosity >= 128) {
            $command[] = '-v';
            if ($verbosity >= 256) {
                $command[] = '-v';
            }
        }
    }

    $command = array_merge($command, $this->argument('network'));

    $scan_process = (new Process($command))
        ->setTimeout(null)
        ->setIdleTimeout(null)
        ->setTty(Process::isTtySupported() && ! $this->option('quiet'));
    $scan_process->run();

    if (! Process::isTtySupported() && ! $this->option('quiet')) {
        // just dump the output after we are done if we couldn't use tty
        $this->line($scan_process->getOutput());
    }

    return $scan_process->getExitCode();
})->purpose(__('Scan the network for hosts and try to add them to UpdiveNSM'));

Artisan::command('poller:flap', function (): void {
    $now            = now();
    $windowMinutes  = 10;  // look-back window for counting changes
    $flapThreshold  = 3;   // min changes within window to be "flapping"
    $stableMinutes  = 15;  // no changes for this long → no longer flapping
    $keepDays       = 1;   // keep port_state_changes history for N days

    // Load all admin-up ports on non-ignored devices
    $ports = \DB::table('ports')
        ->join('devices', 'devices.device_id', '=', 'ports.device_id')
        ->where('devices.ignore', 0)
        ->where('ports.ifAdminStatus', 'up')
        ->select('ports.port_id', 'ports.device_id', 'ports.ifName',
                 'ports.ifOperStatus', 'ports.flapping')
        ->get();

    if ($ports->isEmpty()) {
        $this->info('Flap: no admin-up ports found.');
        return;
    }

    $portIds = $ports->pluck('port_id');

    // Latest known recorded state for each port (1 query)
    $latestByPort = \DB::table('port_state_changes')
        ->whereIn('port_id', $portIds)
        ->orderByDesc('changed_at')
        ->get()
        ->groupBy('port_id')
        ->map(fn ($g) => $g->first());

    // Change counts in window (1 query)
    $windowStart = $now->copy()->subMinutes($windowMinutes);
    $changeCounts = \DB::table('port_state_changes')
        ->whereIn('port_id', $portIds)
        ->where('changed_at', '>=', $windowStart)
        ->selectRaw('port_id, COUNT(*) as cnt')
        ->groupBy('port_id')
        ->pluck('cnt', 'port_id');

    // Most recent change time per port (to determine stability)
    $lastChangeTimes = \DB::table('port_state_changes')
        ->whereIn('port_id', $portIds)
        ->selectRaw('port_id, MAX(changed_at) as last_at')
        ->groupBy('port_id')
        ->pluck('last_at', 'port_id');

    $newInserts    = [];
    $nowFlapping   = [];
    $noLongerFlap  = [];
    $newFlap       = 0;
    $cleared       = 0;

    foreach ($ports as $port) {
        $latest      = $latestByPort->get($port->port_id);
        $currentState = $port->ifOperStatus ?? 'unknown';

        // ── Record state change if detected ──────────────────────────────
        if (! $latest) {
            // First time seeing this port — record baseline
            $newInserts[] = [
                'port_id'    => $port->port_id,
                'device_id'  => $port->device_id,
                'from_state' => $currentState,
                'to_state'   => $currentState,
                'changed_at' => $now,
            ];
        } elseif ($latest->to_state !== $currentState) {
            // State changed since last record
            $newInserts[] = [
                'port_id'    => $port->port_id,
                'device_id'  => $port->device_id,
                'from_state' => $latest->to_state,
                'to_state'   => $currentState,
                'changed_at' => $now,
            ];
        }

        // ── Evaluate flapping ─────────────────────────────────────────────
        // Count includes any new change we just added
        $countInWindow  = (int) ($changeCounts->get($port->port_id, 0));
        $hasNewChange   = isset($newInserts[count($newInserts) - 1])
                          && $newInserts[count($newInserts) - 1]['port_id'] === $port->port_id
                          && $latest !== null; // not baseline
        if ($hasNewChange) $countInWindow++;

        $lastChangeAt   = $lastChangeTimes->get($port->port_id);
        $minutesSinceChange = $lastChangeAt
            ? $now->diffInMinutes(\Carbon\Carbon::parse($lastChangeAt))
            : $stableMinutes + 1;

        // Flapping: enough changes in window
        // Stable: no change recently even if it was flapping before
        $isFlapping = ($countInWindow >= $flapThreshold)
                   && ($minutesSinceChange < $stableMinutes);

        if ($isFlapping) {
            $nowFlapping[] = $port->port_id;
            if (! $port->flapping) $newFlap++;
        } else {
            if ($port->flapping) $noLongerFlap[] = $port;
        }
    }

    // ── Bulk insert new state changes ────────────────────────────────────
    if ($newInserts) {
        \DB::table('port_state_changes')->insert($newInserts);
    }

    // ── Update flapping flag on ports ────────────────────────────────────
    if ($nowFlapping) {
        \DB::table('ports')->whereIn('port_id', $nowFlapping)
            ->update(['flapping' => 1]);
    }
    foreach ($noLongerFlap as $port) {
        \DB::table('ports')->where('port_id', $port->port_id)
            ->update(['flapping' => 0]);

        // If no other ports on that device still flapping → clear the alert
        $stillFlapping = \DB::table('ports')
            ->where('device_id', $port->device_id)
            ->where('flapping', 1)
            ->where('port_id', '!=', $port->port_id)
            ->exists();

        if (! $stillFlapping) {
            $flapRule = \DB::table('alert_rules')->where('name', 'Port Flapping')->value('id');
            if ($flapRule) {
                \DB::table('alerts')
                    ->where('rule_id', $flapRule)
                    ->where('device_id', $port->device_id)
                    ->whereIn('state', [-1, 1, 2, 3])
                    ->update(['state' => 0, 'open' => 0, 'pending_count' => 0]);
            }
        }
        $cleared++;
    }

    // ── Prune old records ─────────────────────────────────────────────────
    \DB::table('port_state_changes')
        ->where('changed_at', '<', $now->copy()->subDays($keepDays))
        ->delete();

    $this->info("Flap: {$newFlap} new, " . count($nowFlapping) . " ongoing, {$cleared} cleared.");
})->purpose('Detect port flapping (rapid up/down state changes)');

Artisan::command('poller:status', function (): void {
    $pending    = \DB::table('jobs')->where('queue', 'poller')->whereNull('reserved_at')->count();
    $processing = \DB::table('jobs')->where('queue', 'poller')->whereNotNull('reserved_at')->count();
    $failed     = \DB::table('failed_jobs')->where('queue', 'poller')->count();
    $total      = \App\Models\Device::where('ignore', 0)->count();

    $lastPoll = \DB::table('devices')
        ->where('ignore', 0)
        ->whereNotNull('last_polled')
        ->max('last_polled');

    $oldestUnpolled = \DB::table('devices')
        ->where('ignore', 0)
        ->whereNotNull('last_polled')
        ->min('last_polled');

    $this->table(
        ['Metric', 'Value'],
        [
            ['Total devices',  $total],
            ['Queue: pending', $pending],
            ['Queue: running', $processing],
            ['Failed jobs',    $failed],
            ['Last poll completed', $lastPoll ?? 'never'],
            ['Oldest last-poll',   $oldestUnpolled ?? 'never'],
        ]
    );
})->purpose('Show parallel poller queue status');

// mark schedule working
Schedule::call(function (): void {
    Cache::put('scheduler_working', now(), now()->addMinutes(6));
})->name('schedule operational check')->everyFiveMinutes();

// schedule maintenance, should be after all others
$maintenance_log_file = UpdiveNSMConfig::get('log_dir') . '/maintenance.log';

Schedule::command(MaintenanceFetchOuis::class)
    ->weeklyOn(0, Time::pseudoRandomBetween('01:00', '01:59'))
    ->onOneServer()
    ->appendOutputTo($maintenance_log_file)
    ->onFailure(fn () => Eventlog::log('The scheduled command maintenance:fetch-ouis failed to run. Check the maintenance.log for details.', null, 'maintenance', Severity::Error));

Schedule::command(MaintenanceCleanupNetworks::class)
    ->weeklyOn(0, Time::pseudoRandomBetween('02:00', '02:59'))
    ->onOneServer()
    ->appendOutputTo($maintenance_log_file)
    ->onFailure(fn () => Eventlog::log('The scheduled command maintenance:cleanup-networks failed to run. Check the maintenance.log for details.', null, 'maintenance', Severity::Error));

Schedule::command(MaintenanceFetchRSS::class)
    ->dailyAt(Time::pseudoRandomBetween('03:00', '03:59'))
    ->onOneServer()
    ->appendOutputTo($maintenance_log_file)
    ->onFailure(fn () => Eventlog::log('The scheduled command maintenance:fetch-rss failed to run. Check the maintenance.log for details.', null, 'maintenance', Severity::Error));

Schedule::command(MaintenanceCleanupSyslog::class)
    ->hourlyAt(17)
    ->onOneServer()
    ->withoutOverlapping()
    ->appendOutputTo($maintenance_log_file)
    ->onFailure(fn () => Eventlog::log('The scheduled command maintenance:cleanup-syslog failed to run. Check the maintenance.log for details.', null, 'maintenance', Severity::Error));

Schedule::command(MaintenanceDiscoverSslCertificates::class)
    ->dailyAt(Time::pseudoRandomBetween('04:00', '04:59'))
    ->onOneServer()
    ->appendOutputTo($maintenance_log_file)
    ->when(fn () => UpdiveNSMConfig::get('ssl_certificates.auto_discover', false))
    ->onFailure(fn () => Eventlog::log('The scheduled command maintenance:discover-ssl-certificates failed to run. Check the maintenance.log for details.', null, 'maintenance', Severity::Error));

Schedule::command(MaintenanceRefreshSslCertificates::class)
    ->dailyAt(Time::pseudoRandomBetween('05:00', '05:59'))
    ->onOneServer()
    ->appendOutputTo($maintenance_log_file)
    ->onFailure(fn () => Eventlog::log('The scheduled command maintenance:refresh-ssl-certificates failed to run. Check the maintenance.log for details.', null, 'maintenance', Severity::Error));

Schedule::command('device:poll all --dispatch')
    ->everyFiveMinutes()
    ->runInBackground();

Schedule::command('device:discover all')
    ->hourly()
    ->withoutOverlapping(55)
    ->runInBackground();

Schedule::command('metrics:collect')
    ->everyFiveMinutes()
    ->withoutOverlapping(4)
    ->runInBackground();

Schedule::command('metrics:aggregate')
    ->hourly()
    ->withoutOverlapping(55)
    ->runInBackground();

Schedule::command('metrics:partition --months=3')
    ->monthlyOn(1, '02:00')
    ->runInBackground();

Schedule::command('metrics:baseline')
    ->hourly()
    ->withoutOverlapping(50)
    ->runInBackground();

Schedule::command('metrics:anomaly')
    ->everyFifteenMinutes()
    ->withoutOverlapping(10)
    ->runInBackground();

Schedule::command('metrics:forecast')
    ->hourlyAt(30)
    ->withoutOverlapping(50)
    ->runInBackground();

Schedule::command('poller:alerts')
    ->everyMinute()
    ->withoutOverlapping(1)
    ->runInBackground();

Schedule::command('poller:flap')
    ->everyMinute()
    ->withoutOverlapping(1)
    ->runInBackground();
