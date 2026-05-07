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

    foreach ($rules as $rule) {
        // Build a raw query to evaluate the rule against all devices
        // Supported simple field comparisons: table.column op value
        // e.g. "ports.ifOperStatus = \"down\" AND ports.ifAdminStatus = \"up\""
        $query = $rule->query ?? '';

        // Map table references → actual tables with device_id join
        $tableMap = [
            'devices'    => ['table' => 'devices',    'join' => null],
            'ports'      => ['table' => 'ports',      'join' => 'devices.device_id = ports.device_id'],
            'processors' => ['table' => 'processors', 'join' => 'devices.device_id = processors.device_id'],
            'mempools'   => ['table' => 'mempools',   'join' => 'devices.device_id = mempools.device_id'],
        ];

        // Detect primary table from query
        preg_match_all('/(\w+)\.\w+/', $query, $tableMatches);
        $tables = array_unique($tableMatches[1] ?? []);

        // Skip macros (requires complex logic)
        if (in_array('macros', $tables)) continue;

        $primaryTable = collect($tables)->first(fn($t) => isset($tableMap[$t]));
        if (! $primaryTable || ! isset($tableMap[$primaryTable])) continue;

        // Replace table.column with just column for simple WHERE
        $whereClause = preg_replace('/\b\w+\.(\w+)\b/', '$1', $query);
        if ($whereClause === null) continue;
        // Convert escaped double-quotes to single quotes (SQL string literals)
        $whereClause = str_replace('\\"', "'", $whereClause);
        $whereClause = str_replace('"', "'", $whereClause);

        if (empty($whereClause)) continue;

        try {
            if ($primaryTable === 'devices') {
                $matchingDevices = \DB::table('devices')
                    ->select('device_id', 'hostname')
                    ->where('ignore', 0)
                    ->whereRaw($whereClause)
                    ->get();
            } else {
                [$leftCol, $rightCol] = explode(' = ', $tableMap[$primaryTable]['join']);
                $matchingDevices = \DB::table('devices')
                    ->select('devices.device_id', 'devices.hostname')
                    ->where('devices.ignore', 0)
                    ->join($primaryTable, trim($leftCol), '=', trim($rightCol))
                    ->whereRaw($whereClause)
                    ->get();
            }
        } catch (\Exception $e) {
            continue;
        }

        $matchingIds = $matchingDevices->pluck('device_id')->unique()->values();

        // Active alerts for this rule
        $activeAlerts = \DB::table('alerts')
            ->where('rule_id', $rule->id)
            ->whereIn('state', [1, 2, 3])
            ->get()
            ->keyBy('device_id');

        // Fire new alerts
        foreach ($matchingIds as $deviceId) {
            if (! isset($devices[$deviceId])) continue;
            if ($activeAlerts->has($deviceId)) continue; // already active

            \DB::table('alerts')->updateOrInsert(
                ['rule_id' => $rule->id, 'device_id' => $deviceId],
                ['state' => 1, 'open' => 1, 'alerted' => 0, 'note' => '', 'info' => json_encode([])]
            );
            \DB::table('alert_log')->insert([
                'rule_id'    => $rule->id,
                'device_id'  => $deviceId,
                'state'      => 1,
                'details'    => json_encode(['rule' => $rule->name]),
                'time_logged'=> $now,
            ]);
            $fired++;
        }

        // Clear alerts where condition no longer holds
        foreach ($activeAlerts as $deviceId => $alert) {
            if ($matchingIds->contains($deviceId)) continue;

            \DB::table('alerts')
                ->where('rule_id', $rule->id)
                ->where('device_id', $deviceId)
                ->update(['state' => 0, 'open' => 0]);
            \DB::table('alert_log')->insert([
                'rule_id'    => $rule->id,
                'device_id'  => $deviceId,
                'state'      => 0,
                'details'    => json_encode(['rule' => $rule->name, 'cleared' => true]),
                'time_logged'=> $now,
            ]);
            $cleared++;
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

Schedule::command('device:poll all')
    ->everyFiveMinutes()
    ->withoutOverlapping(5)
    ->runInBackground();

Schedule::command('device:discover all')
    ->hourly()
    ->withoutOverlapping(55)
    ->runInBackground();

Schedule::command('metrics:collect')
    ->everyFiveMinutes()
    ->withoutOverlapping(4)
    ->runInBackground();

Schedule::command('poller:alerts')
    ->everyMinute()
    ->withoutOverlapping(1)
    ->runInBackground();
