<?php

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::prefix('v0')->group(function (): void {
    Route::get('ping', fn () => response()->json(['message' => 'pong']))->name('ping');
    Route::get('system', [App\Api\Controllers\LegacyApiController::class, 'server_info'])->name('server_info');
    Route::get('', [App\Api\Controllers\LegacyApiController::class, 'show_endpoints']);

    // Device relationships (parent→child topology)
    Route::get('device_relationships', function () {
        $rows = \DB::table('device_relationships')
            ->join('devices as p', 'p.device_id', '=', 'device_relationships.parent_device_id')
            ->join('devices as c', 'c.device_id', '=', 'device_relationships.child_device_id')
            ->select('p.hostname as parent', 'c.hostname as child')
            ->get();
        return response()->json(['relationships' => $rows]);
    });

    // ── Topology (nodes + edges for network map) ──────────────────
    Route::get('topology', function () {
        // Nodes: all devices
        $devices = \DB::table('devices')
            ->select('device_id', 'hostname', 'sysName', 'display', 'status', 'type', 'os', 'location_id', 'uptime')
            ->where('ignore', 0)
            ->get();

        // Port rates for node traffic info
        $portRates = \DB::table('ports')
            ->select('device_id',
                \DB::raw('SUM(ifInOctets_rate)  as total_in'),
                \DB::raw('SUM(ifOutOctets_rate) as total_out'),
                \DB::raw('SUM(CASE WHEN ifOperStatus="up" THEN 1 ELSE 0 END) as ports_up'),
                \DB::raw('COUNT(*) as ports_total'))
            ->whereNotNull('ifInOctets_rate')
            ->groupBy('device_id')
            ->get()
            ->keyBy('device_id');

        $nodes = $devices->map(function ($d) use ($portRates) {
            $pr    = $portRates->get($d->device_id);
            $label = $d->display ?: $d->sysName ?: $d->hostname;
            return [
                'id'          => (string) $d->device_id,
                'label'       => $label,
                'hostname'    => $d->hostname,
                'status'      => (int) $d->status,
                'type'        => $d->type   ?? 'unknown',
                'os'          => $d->os     ?? 'generic',
                'uptime'      => $d->uptime,
                'traffic_in'  => $pr ? (int) $pr->total_in  : 0,
                'traffic_out' => $pr ? (int) $pr->total_out : 0,
                'ports_up'    => $pr ? (int) $pr->ports_up  : 0,
                'ports_total' => $pr ? (int) $pr->ports_total : 0,
            ];
        })->values();

        // Edges: LLDP links (deduplicated — keep one direction per pair)
        $links = \DB::table('links')
            ->where('active', 1)
            ->whereNotNull('remote_device_id')
            ->where('remote_device_id', '>', 0)
            ->select('local_device_id', 'remote_device_id', 'protocol',
                     'remote_port', 'remote_platform')
            ->get();

        $seen  = [];
        $edges = [];
        foreach ($links as $lk) {
            $a   = min($lk->local_device_id, $lk->remote_device_id);
            $b   = max($lk->local_device_id, $lk->remote_device_id);
            $key = "{$a}-{$b}";
            if (isset($seen[$key])) {
                // Count parallel links for edge thickness
                $seen[$key]++;
                continue;
            }
            $seen[$key] = 1;
            $edges[] = [
                'id'       => $key,
                'source'   => (string) $lk->local_device_id,
                'target'   => (string) $lk->remote_device_id,
                'protocol' => $lk->protocol ?? 'lldp',
                'port'     => $lk->remote_port,
                'count'    => 1,
            ];
        }
        // Set parallel link counts
        foreach ($edges as &$e) {
            $e['count'] = $seen[$e['id']] ?? 1;
        }
        unset($e);

        // Also add device_relationships as edges (if no LLDP)
        if (empty($edges)) {
            $rels = \DB::table('device_relationships')->get();
            foreach ($rels as $r) {
                $a = min($r->parent_device_id, $r->child_device_id);
                $b = max($r->parent_device_id, $r->child_device_id);
                $edges[] = [
                    'id'       => "{$a}-{$b}",
                    'source'   => (string) $r->parent_device_id,
                    'target'   => (string) $r->child_device_id,
                    'protocol' => 'hierarchy',
                    'port'     => null,
                    'count'    => 1,
                ];
            }
        }

        return response()->json([
            'status' => 'ok',
            'nodes'  => $nodes,
            'edges'  => $edges,
        ]);
    });

    // ── Services CRUD ─────────────────────────────────────────────
    Route::middleware(['can:admin'])->prefix('services')->group(function (): void {
        Route::post('', function (\Illuminate\Http\Request $req) {
            $req->validate([
                'device_id'    => 'required|integer|exists:devices,device_id',
                'service_type' => 'required|string|max:255',
            ]);
            $id = \DB::table('services')->insertGetId([
                'device_id'       => $req->input('device_id'),
                'service_type'    => $req->input('service_type'),
                'service_name'    => $req->input('service_name', ''),
                'service_desc'    => $req->input('service_desc', ''),
                'service_ip'      => $req->input('service_ip', ''),
                'service_param'   => $req->input('service_param', ''),
                'service_ignore'  => $req->boolean('service_ignore') ? 1 : 0,
                'service_disabled'=> $req->boolean('service_disabled') ? 1 : 0,
                'service_status'  => 3,
                'service_message' => '',
                'service_changed' => 0,
                'service_template_id' => 0,
            ]);
            return response()->json(['status' => 'ok', 'message' => 'Service created', 'service_id' => $id], 201);
        });

        Route::patch('{id}', function (\Illuminate\Http\Request $req, $id) {
            $fields = $req->only(['service_type','service_name','service_desc','service_ip','service_param','service_disabled','service_ignore']);
            if (isset($fields['service_disabled'])) $fields['service_disabled'] = $fields['service_disabled'] ? 1 : 0;
            if (isset($fields['service_ignore']))   $fields['service_ignore']   = $fields['service_ignore']   ? 1 : 0;
            \DB::table('services')->where('service_id', $id)->update($fields);
            return response()->json(['status' => 'ok', 'message' => 'Service updated']);
        })->where('id', '[0-9]+');

        Route::delete('{id}', function ($id) {
            \DB::table('services')->where('service_id', $id)->delete();
            return response()->json(['status' => 'ok', 'message' => 'Service deleted']);
        })->where('id', '[0-9]+');
    });

    // ── Eventlog with full filtering + pagination ─────────────────
    Route::get('eventlog', function (\Illuminate\Http\Request $req) {
        $perPage = min((int) $req->input('per_page', 50), 500);
        $page    = max((int) $req->input('page', 1), 1);
        $offset  = ($page - 1) * $perPage;

        $q = \DB::table('eventlog')
            ->join('devices', 'devices.device_id', '=', 'eventlog.device_id')
            ->select(
                'eventlog.event_id', 'eventlog.device_id', 'eventlog.datetime',
                'eventlog.message',  'eventlog.type',      'eventlog.severity',
                'eventlog.username', 'eventlog.reference',
                'devices.hostname',  'devices.sysName'
            );

        if ($req->filled('from'))     $q->where('eventlog.datetime', '>=', $req->input('from'));
        if ($req->filled('to'))       $q->where('eventlog.datetime', '<=', $req->input('to'));
        if ($req->filled('device_id'))$q->where('eventlog.device_id', $req->input('device_id'));
        if ($req->filled('hostname')) $q->where('devices.hostname', $req->input('hostname'));
        if ($req->filled('type'))     $q->where('eventlog.type',     $req->input('type'));
        if ($req->filled('severity')) $q->where('eventlog.severity', $req->input('severity'));
        if ($req->filled('search'))   $q->where('eventlog.message',  'like', '%'.$req->input('search').'%');

        $total = $q->count();
        $logs  = $q->orderByDesc('eventlog.event_id')->offset($offset)->limit($perPage)->get();

        return response()->json([
            'status'   => 'ok',
            'logs'     => $logs,
            'total'    => $total,
            'page'     => $page,
            'per_page' => $perPage,
            'pages'    => (int) ceil($total / $perPage),
        ]);
    });

    // ── SNMP Connection Wizard ────────────────────────────────────
    Route::post('devices/snmp-check', function (\Illuminate\Http\Request $req) {
        $req->validate(['hostname' => 'required|string|max:253']);

        $host      = trim($req->input('hostname'));
        $port      = (int) $req->input('port', 161);
        $snmpver   = $req->input('snmpver', 'v2c');
        $transport = $req->input('transport', 'udp');
        $community = $req->input('community', 'public');

        // SNMPv3 params
        $authlevel  = $req->input('authlevel',  'noAuthNoPriv');
        $authname   = $req->input('authname',   '');
        $authpass   = $req->input('authpass',   '');
        $authalgo   = $req->input('authalgo',   'MD5');
        $cryptopass = $req->input('cryptopass', '');
        $cryptoalgo = $req->input('cryptoalgo', 'AES');

        $steps = [];

        $run = function (string $cmd): array {
            exec($cmd . ' 2>&1', $out, $code);
            return ['output' => implode("\n", $out), 'code' => $code];
        };

        // ── Step 1: Ping ──────────────────────────────────────────
        $r = $run('fping -c 1 -t 2000 ' . escapeshellarg($host));
        $pingOk = $r['code'] === 0;
        $steps[] = [
            'step' => 'Ping',
            'ok'   => $pingOk,
            'msg'  => $pingOk ? 'Host is reachable' : 'No ping response — host may be down or ICMP blocked',
        ];

        // ── Step 2: SNMP port reachable (send with bad community) ─
        $snmpTarget = escapeshellarg("{$transport}:{$host}/{$port}");
        $portProbe  = $run("snmpget -v2c -c invalid_xyz_probe -r 0 -t 3 {$snmpTarget} SNMPv2-MIB::sysDescr.0");
        $portOpen   = str_contains($portProbe['output'], 'Authentication') ||
                      str_contains($portProbe['output'], 'sysDescr') ||
                      str_contains($portProbe['output'], 'STRING');
        $steps[] = [
            'step' => 'UDP Port 161',
            'ok'   => $portOpen,
            'msg'  => $portOpen ? 'SNMP port is open and responding' : 'No response on UDP 161 — port may be closed or filtered',
        ];

        if (! $portOpen) {
            return response()->json(['status' => 'ok', 'steps' => $steps]);
        }

        // ── Step 3: SNMP auth ─────────────────────────────────────
        if ($snmpver === 'v2c' || $snmpver === 'v1') {
            $ver = $snmpver === 'v1' ? '1' : '2c';
            $r   = $run("snmpget -v{$ver} -c " . escapeshellarg($community) . " -r 1 -t 5 {$snmpTarget} SNMPv2-MIB::sysDescr.0");
            $authOk  = str_contains($r['output'], 'STRING') || str_contains($r['output'], 'sysDescr');
            $authMsg = $authOk
                ? "Community '{$community}' accepted"
                : (str_contains($r['output'], 'Authentication') ? "Wrong community string" : "SNMP query timed out");
            $steps[] = ['step' => 'SNMP Community', 'ok' => $authOk, 'msg' => $authMsg];

            if (! $authOk) {
                return response()->json(['status' => 'ok', 'steps' => $steps]);
            }

            // ── Step 4: sysDescr ─────────────────────────────────
            preg_match('/STRING:\s*(.+)$/', $r['output'], $m);
            $sysDescr = isset($m[1]) ? trim($m[1]) : null;
            $steps[] = [
                'step' => 'sysDescr',
                'ok'   => (bool) $sysDescr,
                'msg'  => $sysDescr ?? 'Could not retrieve sysDescr',
            ];

            // ── Step 5: sysObjectID + OS detection ────────────────
            $r2 = $run("snmpget -v{$ver} -c " . escapeshellarg($community) . " -r 1 -t 5 {$snmpTarget} SNMPv2-MIB::sysObjectID.0 --numeric");
            preg_match('/OID:\s*(.+)$/', $r2['output'], $m2);
            $sysObjectID = isset($m2[1]) ? trim($m2[1]) : null;

            $detectedOs = null;
            if ($sysObjectID) {
                $mapFile = base_path('resources/definitions/vendor_oid_map.yaml');
                if (file_exists($mapFile)) {
                    $map = \Symfony\Component\Yaml\Yaml::parseFile($mapFile);
                    foreach ((array) $map as $prefix => $os) {
                        if (str_starts_with($sysObjectID, (string) $prefix)) {
                            $detectedOs = $os;
                            break;
                        }
                    }
                }
            }

            $steps[] = [
                'step' => 'OS Detection',
                'ok'   => (bool) $detectedOs,
                'msg'  => $detectedOs ? "Detected: {$detectedOs}" : "OS not recognized (will use 'generic')",
                'data' => ['sysObjectID' => $sysObjectID, 'os' => $detectedOs],
            ];

        } else {
            // SNMPv3
            $sec  = escapeshellarg($authname);
            $lvl  = escapeshellarg($authlevel);
            $ap   = escapeshellarg($authpass);
            $aa   = escapeshellarg($authalgo);
            $cp   = escapeshellarg($cryptopass);
            $ca   = escapeshellarg($cryptoalgo);

            if ($authlevel === 'noAuthNoPriv') {
                $v3cmd = "snmpget -v3 -l {$lvl} -u {$sec} -r 1 -t 5 {$snmpTarget} SNMPv2-MIB::sysDescr.0";
            } elseif ($authlevel === 'authNoPriv') {
                $v3cmd = "snmpget -v3 -l {$lvl} -u {$sec} -a {$aa} -A {$ap} -r 1 -t 5 {$snmpTarget} SNMPv2-MIB::sysDescr.0";
            } else {
                $v3cmd = "snmpget -v3 -l {$lvl} -u {$sec} -a {$aa} -A {$ap} -x {$ca} -X {$cp} -r 1 -t 5 {$snmpTarget} SNMPv2-MIB::sysDescr.0";
            }

            $r      = $run($v3cmd);
            $authOk = str_contains($r['output'], 'STRING') || str_contains($r['output'], 'sysDescr');
            $steps[] = [
                'step' => 'SNMPv3 Auth',
                'ok'   => $authOk,
                'msg'  => $authOk ? "SNMPv3 authentication successful" : "SNMPv3 auth failed: " . trim(explode("\n", $r['output'])[0] ?? ''),
            ];

            if ($authOk) {
                preg_match('/STRING:\s*(.+)$/', $r['output'], $m);
                $sysDescr = isset($m[1]) ? trim($m[1]) : null;
                $steps[]  = ['step' => 'sysDescr', 'ok' => (bool) $sysDescr, 'msg' => $sysDescr ?? 'Could not retrieve sysDescr'];
            }
        }

        return response()->json(['status' => 'ok', 'steps' => $steps]);
    });

    // ── Device list (cached, 5 min) ───────────────────────────────
    Route::get('devices', function (\Illuminate\Http\Request $req) {
        // Skip cache if filtering parameters are present
        if ($req->hasAny(['hostname', 'sysName', 'type', 'os', 'group', 'ip'])) {
            // Fall through to legacy handler by returning null — handled below
            return null;
        }
        $devices = \Cache::remember('device_list', 300, function () {
            return \DB::table('devices')
                ->select([
                    'device_id','hostname','sysName','display','ip','os','hardware','version',
                    'serial','type','purpose','status','uptime','last_polled','last_discovered',
                    'ignore','disabled','location_id','community','snmpver','os_forced',
                ])
                ->orderBy('hostname')
                ->get();
        });
        return response()->json(['status' => 'ok', 'count' => $devices->count(), 'devices' => $devices]);
    });

    // ── Device full data (single request, replaces 7 parallel calls) ─
    Route::get('devices/{hostname}/full', function (string $hostname) {
        $device = \DB::table('devices')
            ->where('hostname', $hostname)->orWhere('ip', $hostname)
            ->first();

        if (! $device) {
            return response()->json(['status' => 'error', 'message' => 'Device not found'], 404);
        }

        $deviceId = $device->device_id;

        // All queries run in the same DB connection — no network round-trips
        $ports = \DB::table('ports')
            ->where('device_id', $deviceId)
            ->select([
                'port_id','device_id','ifIndex','ifName','ifAlias','ifDescr',
                'ifOperStatus','ifAdminStatus','ifSpeed','ifPhysAddress','ifType','ifMtu',
                'ifInOctets_rate','ifOutOctets_rate',
                'ifInUcastPkts_rate','ifOutUcastPkts_rate',
                'poll_time','ignore','disabled',
            ])
            ->orderBy('ifIndex')
            ->get();

        $processors = \DB::table('processors')
            ->where('device_id', $deviceId)
            ->get();

        $mempools = \DB::table('mempools')
            ->where('device_id', $deviceId)
            ->get();

        $alerts = \DB::table('alerts')
            ->join('alert_rules', 'alert_rules.id', '=', 'alerts.rule_id')
            ->where('alerts.device_id', $deviceId)
            ->select('alerts.*', 'alert_rules.name', 'alert_rules.severity')
            ->orderByDesc('alerts.timestamp')
            ->limit(50)
            ->get();

        $eventlog = \DB::table('eventlog')
            ->where('device_id', $deviceId)
            ->orderByDesc('event_id')
            ->limit(50)
            ->get();

        $links = \DB::table('links')
            ->join('ports as lp', 'lp.port_id', '=', 'links.local_port_id')
            ->join('ports as rp', 'rp.port_id', '=', 'links.remote_port_id')
            ->join('devices as rd', 'rd.device_id', '=', 'links.remote_device_id')
            ->where('links.local_device_id', $deviceId)
            ->select(
                'links.*',
                'lp.ifName as local_ifName',
                'rp.ifName as remote_ifName',
                'rd.hostname as remote_hostname',
                'rd.sysName as remote_sysName'
            )
            ->get();

        $sanitize = function ($value) use (&$sanitize) {
            if (is_string($value)) {
                return mb_convert_encoding($value, 'UTF-8', 'UTF-8');
            }
            if (is_array($value)) {
                return array_map($sanitize, $value);
            }
            if (is_object($value)) {
                return (object) array_map($sanitize, (array) $value);
            }
            return $value;
        };

        $data = [
            'status'     => 'ok',
            'device'     => $sanitize((array) $device),
            'ports'      => $sanitize($ports->map(fn($p) => (array)$p)->toArray()),
            'processors' => $sanitize($processors->map(fn($p) => (array)$p)->toArray()),
            'mempools'   => $sanitize($mempools->map(fn($p) => (array)$p)->toArray()),
            'alerts'     => $sanitize($alerts->map(fn($p) => (array)$p)->toArray()),
            'eventlog'   => $sanitize($eventlog->map(fn($p) => (array)$p)->toArray()),
            'links'      => $sanitize($links->map(fn($p) => (array)$p)->toArray()),
        ];

        return response(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE), 200)
            ->header('Content-Type', 'application/json');
    })->where('hostname', '.*');

    // OS override endpoints
    Route::get('devices/os-list', function () {
        $files = glob(base_path('resources/definitions/os_detection/*.yaml'));
        $names = array_map(fn ($f) => pathinfo($f, PATHINFO_FILENAME), $files ?? []);
        sort($names);
        return response()->json(['status' => 'ok', 'os_list' => $names]);
    });

    Route::patch('devices/{hostname}/os', function ($hostname, \Illuminate\Http\Request $req) {
        $req->validate([
            'os'        => 'required|string|max:100',
            'os_forced' => 'boolean',
        ]);
        $device = \App\Models\Device::where('hostname', $hostname)
            ->orWhere('ip', $hostname)->firstOrFail();
        $device->os        = trim($req->input('os'));
        $device->os_forced = $req->boolean('os_forced', true);
        $device->save();
        \Cache::forget('device_list');
        return response()->json(['status' => 'ok', 'os' => $device->os, 'os_forced' => (bool) $device->os_forced]);
    });

    Route::delete('devices/{hostname}/os', function ($hostname) {
        $device = \App\Models\Device::where('hostname', $hostname)
            ->orWhere('ip', $hostname)->firstOrFail();
        $device->os_forced = 0;
        $device->save();
        \Cache::forget('device_list');
        return response()->json(['status' => 'ok', 'message' => 'OS lock removed; will be re-detected on next discovery.']);
    });

    // Device sub-resource data endpoints (not in legacy API)
    Route::get('devices/{hostname}/processors', function ($hostname) {
        $device = \App\Models\Device::with('processors')->where('hostname', $hostname)->orWhere('ip', $hostname)->firstOrFail();
        return response()->json(['status' => 'ok', 'processors' => $device->processors->toArray(), 'count' => $device->processors->count()]);
    });
    Route::get('devices/{hostname}/mempools', function ($hostname) {
        $device = \App\Models\Device::with('mempools')->where('hostname', $hostname)->orWhere('ip', $hostname)->firstOrFail();
        return response()->json(['status' => 'ok', 'mempools' => $device->mempools->toArray(), 'count' => $device->mempools->count()]);
    });

    // global read only access required
    Route::middleware(['can:global-read'])->group(function (): void {
        Route::get('alert_templates/{id}', [App\Api\Controllers\LegacyApiController::class, 'list_alert_templates'])->name('get_alert_template');
        Route::get('alert_templates', [App\Api\Controllers\LegacyApiController::class, 'list_alert_templates'])->name('list_alert_templates');
        Route::get('pollers', [App\Api\Controllers\LegacyApiController::class, 'list_pollers'])->name('list_pollers');
        Route::get('pollers/log', [App\Api\Controllers\LegacyApiController::class, 'list_poller_log'])->name('list_poller_log');
        Route::get('bgp', [App\Api\Controllers\LegacyApiController::class, 'list_bgp'])->name('list_bgp');
        Route::get('bgp/{id}', [App\Api\Controllers\LegacyApiController::class, 'get_bgp'])->name('get_bgp');
        Route::get('ospf', [App\Api\Controllers\LegacyApiController::class, 'list_ospf'])->name('list_ospf');
        Route::get('ospf_ports', [App\Api\Controllers\LegacyApiController::class, 'list_ospf_ports'])->name('list_ospf_ports');
        Route::get('ospfv3', [App\Api\Controllers\LegacyApiController::class, 'list_ospfv3'])->name('list_ospfv3');
        Route::get('ospfv3_ports', [App\Api\Controllers\LegacyApiController::class, 'list_ospfv3_ports'])->name('list_ospfv3_ports');
        Route::get('oxidized/{hostname?}', [App\Api\Controllers\LegacyApiController::class, 'list_oxidized'])->name('list_oxidized');
        Route::get('devicegroups/{name}', [App\Api\Controllers\LegacyApiController::class, 'get_devices_by_group'])->name('get_devices_by_group');
        Route::get('devicegroups', [App\Api\Controllers\LegacyApiController::class, 'get_device_groups'])->name('get_device_groups');
        Route::get('port_groups', [App\Api\Controllers\LegacyApiController::class, 'get_port_groups'])->name('get_port_groups');
        Route::get('port_groups/{name}', [App\Api\Controllers\LegacyApiController::class, 'get_ports_by_group'])->name('get_ports_by_group');
        Route::get('portgroups/multiport/bits/{id}', [App\Api\Controllers\LegacyApiController::class, 'get_graph_by_portgroup'])->name('get_graph_by_portgroup_multiport_bits');
        Route::get('portgroups/{group}', [App\Api\Controllers\LegacyApiController::class, 'get_graph_by_portgroup'])->name('get_graph_by_portgroup');
        Route::get('alerts/{id}', [App\Api\Controllers\LegacyApiController::class, 'list_alerts'])->name('get_alert');
        Route::get('alerts', [App\Api\Controllers\LegacyApiController::class, 'list_alerts'])->name('list_alerts');
        Route::get('rules/{id}', [App\Api\Controllers\LegacyApiController::class, 'list_alert_rules'])->name('get_alert_rule');
        Route::get('rules', [App\Api\Controllers\LegacyApiController::class, 'list_alert_rules'])->name('list_alert_rules');
        Route::get('routing/vrf/{id}', [App\Api\Controllers\LegacyApiController::class, 'get_vrf'])->name('get_vrf');
        Route::get('routing/ipsec/data/{hostname}', [App\Api\Controllers\LegacyApiController::class, 'list_ipsec'])->name('list_ipsec');
        Route::get('services', function (\Illuminate\Http\Request $req) {
            $q = \DB::table('services')
                ->join('devices', 'devices.device_id', '=', 'services.device_id')
                ->select(
                    'services.service_id', 'services.device_id', 'services.service_type',
                    'services.service_name', 'services.service_desc', 'services.service_ip',
                    'services.service_param', 'services.service_status', 'services.service_message',
                    'services.service_disabled', 'services.service_ignore', 'services.service_changed',
                    'devices.hostname', 'devices.sysName'
                );
            if ($req->filled('hostname')) $q->where('devices.hostname', $req->input('hostname'));
            $rows = $q->orderBy('services.service_id')->get();
            return response()->json(['status' => 'ok', 'services' => $rows, 'count' => $rows->count()]);
        })->name('list_services');
        Route::get('services/{hostname}', [App\Api\Controllers\LegacyApiController::class, 'list_services'])->name('list_services_device');

        Route::prefix('resources')->group(function (): void {
            Route::get('links/{id}', [App\Api\Controllers\LegacyApiController::class, 'get_link'])->name('get_link');
            Route::get('locations', [App\Api\Controllers\LegacyApiController::class, 'list_locations'])->name('list_locations');
            Route::get('ip/addresses/{address_family?}', [App\Api\Controllers\LegacyApiController::class, 'list_ip_addresses'])->name('list_ip_addresses');
            Route::get('ip/arp/{query}/{cidr?}', [App\Api\Controllers\LegacyApiController::class, 'list_arp'])->name('list_arp');
            Route::get('ip/networks/{address_family?}', [App\Api\Controllers\LegacyApiController::class, 'list_ip_networks'])->name('list_ip_networks');
            Route::get('ip/networks/{id}/ip', [App\Api\Controllers\LegacyApiController::class, 'get_network_ip_addresses'])->name('get_network_ip_addresses');
        });

        Route::prefix('logs')->group(function (): void {
            Route::get('eventlog/{hostname?}', [App\Api\Controllers\LegacyApiController::class, 'list_logs'])->name('list_eventlog');
            Route::get('syslog/{hostname?}', [App\Api\Controllers\LegacyApiController::class, 'list_logs'])->name('list_syslog');
            Route::get('alertlog/{hostname?}', [App\Api\Controllers\LegacyApiController::class, 'list_logs'])->name('list_alertlog');
            Route::get('authlog', [App\Api\Controllers\LegacyApiController::class, 'list_logs'])->name('list_authlog');
        });
    });

    // admin required
    Route::middleware(['can:admin'])->group(function (): void {

        // ── Metrics history ───────────────────────────────────────────
        // GET /api/v0/metrics/objects?device_id=1&metric_type=port_in
        Route::get('metrics/objects', function (\Illuminate\Http\Request $req) {
            $q = \DB::table('updive_metrics')
                ->select('object_id', 'object_name')
                ->distinct();
            if ($req->has('device_id'))   $q->where('device_id',   $req->input('device_id'));
            if ($req->has('metric_type')) $q->where('metric_type', $req->input('metric_type'));
            return response()->json(['status' => 'ok', 'objects' => $q->orderBy('object_name')->get()]);
        });

        // GET /api/v0/metrics?device_id=1&metric_type=cpu&object_id=1&from=...&to=...&resolution=auto
        Route::get('metrics', function (\Illuminate\Http\Request $req) {
            $from       = $req->input('from', now()->subHours(6)->toDateTimeString());
            $to         = $req->input('to',   now()->toDateTimeString());
            $resolution = $req->input('resolution', 'auto');
            $limit      = min((int) $req->input('limit', 2000), 10000);

            $diffHours  = (strtotime($to) - strtotime($from)) / 3600;

            // Auto-select best resolution: prefer pre-aggregated rows, fall back to on-the-fly
            if ($resolution === 'auto') {
                if ($diffHours > 24 * 7)   $resolution = 'day';
                elseif ($diffHours > 24)   $resolution = 'hour';
                else                       $resolution = 'raw';
            }

            // Map requested resolution to table resolution column value
            $resMap = ['raw' => 'raw', 'hour' => '1h', 'day' => '1d'];
            $dbResolution = $resMap[$resolution] ?? 'raw';

            // Base query using the pre-aggregated resolution column (fast index scan)
            $q = \DB::table('updive_metrics')
                ->where('resolution', $dbResolution)
                ->whereBetween('collected_at', [$from, $to])
                ->select('device_id', 'metric_type', 'object_id', 'object_name', 'unit',
                         'collected_at', 'value',
                         \DB::raw('value AS value_min'),
                         \DB::raw('value AS value_max'));

            if ($req->has('device_id'))   $q->where('device_id',   $req->input('device_id'));
            if ($req->has('metric_type')) $q->where('metric_type', $req->input('metric_type'));
            if ($req->has('object_id'))   $q->where('object_id',   $req->input('object_id'));

            $rows = $q->orderBy('collected_at')->limit($limit)->get();

            // If no pre-aggregated data exists yet (aggregate job hasn't run), fall back to on-the-fly GROUP BY
            if ($rows->isEmpty() && $resolution !== 'raw') {
                $bindings = [$from, $to];
                $wheres   = 'WHERE m.collected_at BETWEEN ? AND ?';
                if ($req->has('device_id'))   { $wheres .= ' AND m.device_id = ?';   $bindings[] = $req->input('device_id'); }
                if ($req->has('metric_type')) { $wheres .= ' AND m.metric_type = ?'; $bindings[] = $req->input('metric_type'); }
                if ($req->has('object_id'))   { $wheres .= ' AND m.object_id = ?';   $bindings[] = $req->input('object_id'); }

                $fmt = $resolution === 'day' ? '%Y-%m-%d 00:00:00' : '%Y-%m-%d %H:00:00';
                $bindings[] = $limit;
                $rows = collect(\DB::select("
                    SELECT m.device_id, m.metric_type, m.object_id, m.object_name, m.unit,
                           DATE_FORMAT(m.collected_at, '{$fmt}') AS collected_at,
                           AVG(m.value) AS value, MIN(m.value) AS value_min, MAX(m.value) AS value_max
                    FROM updive_metrics m
                    {$wheres}
                    GROUP BY m.device_id, m.metric_type, m.object_id, m.object_name, m.unit,
                             DATE_FORMAT(m.collected_at, '{$fmt}')
                    ORDER BY DATE_FORMAT(m.collected_at, '{$fmt}')
                    LIMIT ?
                ", $bindings));
            }

            return response()->json([
                'status'     => 'ok',
                'resolution' => $resolution,
                'from'       => $from,
                'to'         => $to,
                'count'      => $rows->count(),
                'metrics'    => $rows,
            ]);
        });

        // ── System stats (dashboard panel) ────────────────────────────
        Route::get('system/stats', function () {
            $data = \Cache::remember('system_stats', 60, function () {
                $stats = \DB::selectOne("
                    SELECT
                      (SELECT COUNT(*) FROM devices)                        AS devices_total,
                      (SELECT COUNT(*) FROM devices WHERE status=1)         AS devices_up,
                      (SELECT COUNT(*) FROM ports)                          AS ports_total,
                      (SELECT COUNT(*) FROM ports WHERE ifOperStatus='up')  AS ports_up,
                      (SELECT COUNT(*) FROM alerts WHERE state=1)           AS alerts_active,
                      (SELECT COUNT(*) FROM alert_rules WHERE disabled=0)   AS rules_enabled,
                      (SELECT COUNT(*) FROM eventlog)                       AS events_total,
                      (SELECT MAX(datetime) FROM eventlog)                  AS last_event
                ");
                $devices = \DB::table('devices')
                    ->select('device_id','hostname','sysName','status','uptime','last_polled','last_discovered')
                    ->orderBy('device_id')->get();
                $db_tables = \DB::select("
                    SELECT table_name, table_rows,
                      ROUND(data_length/1024/1024,2)  AS data_mb,
                      ROUND(index_length/1024/1024,2) AS index_mb
                    FROM information_schema.tables
                    WHERE table_schema = DATABASE()
                    ORDER BY data_length DESC LIMIT 10
                ");
                return ['stats' => $stats, 'devices' => $devices, 'db_tables' => $db_tables];
            });
            return response()->json(['status' => 'ok'] + $data);
        });

        // ── Parallel poller queue status ──────────────────────────────
        Route::get('system/poller-queue', function () {
            $pending    = \DB::table('jobs')->where('queue', 'poller')->whereNull('reserved_at')->count();
            $processing = \DB::table('jobs')->where('queue', 'poller')->whereNotNull('reserved_at')->count();
            $failed     = \DB::table('failed_jobs')->where('queue', 'poller')->count();
            $lastPoll   = \DB::table('devices')
                ->where('ignore', 0)->whereNotNull('last_polled')->max('last_polled');
            $staleCount = \DB::table('devices')
                ->where('ignore', 0)
                ->where(fn ($q) => $q->whereNull('last_polled')
                    ->orWhere('last_polled', '<', now()->subMinutes(10)))
                ->count();
            return response()->json([
                'status'     => 'ok',
                'pending'    => $pending,
                'processing' => $processing,
                'failed'     => $failed,
                'last_poll'  => $lastPoll,
                'stale'      => $staleCount,
            ]);
        });

        // ── Alert rule test (dry-run query against live data) ─────────
        Route::post('alerts/test-rule', function (\Illuminate\Http\Request $req) {
            $query = trim($req->input('query', ''));
            if (empty($query)) {
                return response()->json(['status' => 'error', 'message' => 'Query is required.'], 422);
            }

            // Block dangerous keywords
            $lower = strtolower($query);
            foreach (['drop','delete','insert','update','create','alter','truncate','exec','sleep','benchmark'] as $kw) {
                if (str_contains($lower, $kw)) {
                    return response()->json(['status' => 'error', 'message' => "Keyword '$kw' is not allowed."], 422);
                }
            }

            // Detect primary table from query
            $table = 'devices';
            foreach (['processors','mempools','ports','sensors'] as $t) {
                if (str_contains($lower, $t . '.')) { $table = $t; break; }
            }

            try {
                $base = $table === 'devices'
                    ? \DB::table('devices')
                    : \DB::table($table)->join('devices', "$table.device_id", '=', 'devices.device_id');

                $count = (clone $base)->whereRaw($query)->when($table !== 'devices', fn($q) => $q->distinct('devices.device_id'))->count(\DB::raw('DISTINCT devices.device_id'));

                $devices = (clone $base)->whereRaw($query)
                    ->select('devices.hostname', 'devices.sysName')
                    ->distinct()->limit(8)->get()
                    ->map(fn($d) => $d->hostname)->toArray();

                return response()->json(['status' => 'ok', 'count' => $count, 'devices' => $devices]);
            } catch (\Exception $e) {
                return response()->json(['status' => 'error', 'message' => $e->getMessage()], 422);
            }
        });

        // ── Alert histogram (24h hourly, for dashboard timeline widget) ──
        Route::get('alerts/histogram', function () {
            $rows = \DB::table('alert_log')
                ->join('alert_rules', 'alert_log.rule_id', '=', 'alert_rules.id')
                ->where('alert_log.time_logged', '>=', now()->subHours(24))
                ->selectRaw("DATE_FORMAT(alert_log.time_logged, '%H') AS hr, alert_rules.severity, COUNT(*) AS cnt")
                ->groupByRaw('hr, alert_rules.severity')
                ->orderBy('hr')
                ->get();

            $byHour = [];
            foreach ($rows as $r) {
                $h = (int) $r->hr;
                if (!isset($byHour[$h])) $byHour[$h] = ['critical' => 0, 'warning' => 0, 'info' => 0];
                $byHour[$h][$r->severity] = (int) $r->cnt;
            }

            $now = now()->hour;
            $result = [];
            for ($i = 23; $i >= 0; $i--) {
                $h = ($now - $i + 24) % 24;
                $result[] = [
                    'hour'     => sprintf('%02d:00', $h),
                    'critical' => $byHour[$h]['critical'] ?? 0,
                    'warning'  => $byHour[$h]['warning']  ?? 0,
                    'info'     => $byHour[$h]['info']     ?? 0,
                ];
            }

            return response()->json(['status' => 'ok', 'histogram' => $result]);
        });

        // ── System config ─────────────────────────────────────────────
        Route::get('config', function () {
            $rows = \DB::table('config')->orderBy('config_name')->get(['config_name', 'config_value']);
            return response()->json(['status' => 'ok', 'config' => $rows]);
        });
        Route::patch('config', function (\Illuminate\Http\Request $req) {
            $req->validate(['config_name' => 'required|string', 'config_value' => 'required']);
            \DB::table('config')->updateOrInsert(
                ['config_name' => $req->input('config_name')],
                ['config_value' => $req->input('config_value')]
            );
            return response()->json(['status' => 'ok', 'message' => 'Config updated']);
        });

        // ── Users CRUD + API tokens ───────────────────────────────────
        Route::prefix('users')->group(function (): void {
            Route::get('', function () {
                $users = \App\Models\User::with('roles', 'apiTokens')->get()
                    ->map(fn ($u) => [
                        'user_id'           => $u->user_id,
                        'username'          => $u->username,
                        'realname'          => $u->realname,
                        'email'             => $u->email,
                        'descr'             => $u->descr,
                        'enabled'           => (bool) $u->enabled,
                        'can_modify_passwd' => (bool) $u->can_modify_passwd,
                        'auth_type'         => $u->auth_type,
                        'role'              => $u->roles->first()?->name ?? 'user',
                        'token_count'       => $u->apiTokens->count(),
                        'created_at'        => $u->created_at,
                        'updated_at'        => $u->updated_at,
                    ]);
                return response()->json(['status' => 'ok', 'users' => $users, 'count' => $users->count()]);
            });

            Route::get('{id}', function ($id) {
                $u = \App\Models\User::with('roles', 'apiTokens')->findOrFail($id);
                return response()->json(['status' => 'ok', 'user' => [
                    'user_id'           => $u->user_id,
                    'username'          => $u->username,
                    'realname'          => $u->realname,
                    'email'             => $u->email,
                    'descr'             => $u->descr,
                    'enabled'           => (bool) $u->enabled,
                    'can_modify_passwd' => (bool) $u->can_modify_passwd,
                    'auth_type'         => $u->auth_type,
                    'role'              => $u->roles->first()?->name ?? 'user',
                    'token_count'       => $u->apiTokens->count(),
                    'created_at'        => $u->created_at,
                    'updated_at'        => $u->updated_at,
                ]]);
            })->where('id', '[0-9]+');

            Route::post('', function (\Illuminate\Http\Request $req) {
                $req->validate([
                    'username' => 'required|string|max:255|unique:users,username',
                    'password' => 'required|string|min:6',
                    'realname' => 'nullable|string|max:64',
                    'email'    => 'nullable|email|max:64',
                    'role'     => 'nullable|in:admin,global-read,user',
                ]);
                $u = new \App\Models\User([
                    'username'          => $req->input('username'),
                    'realname'          => $req->input('realname', ''),
                    'email'             => $req->input('email', ''),
                    'descr'             => $req->input('descr', ''),
                    'auth_type'         => 'mysql',
                    'can_modify_passwd' => 1,
                    'enabled'           => 1,
                ]);
                $u->setPassword($req->input('password'));
                $u->save();
                $u->syncRoles([$req->input('role', 'user')]);
                return response()->json(['status' => 'ok', 'message' => 'User created', 'user_id' => $u->user_id], 201);
            });

            Route::patch('{id}', function (\Illuminate\Http\Request $req, $id) {
                $u = \App\Models\User::findOrFail($id);
                if ($req->has('realname'))          $u->realname          = $req->input('realname');
                if ($req->has('email'))             $u->email             = $req->input('email');
                if ($req->has('descr'))             $u->descr             = $req->input('descr');
                if ($req->has('enabled'))           $u->enabled           = (bool) $req->input('enabled');
                if ($req->has('can_modify_passwd')) $u->can_modify_passwd = (bool) $req->input('can_modify_passwd');
                if ($req->has('password') && $req->input('password')) {
                    $u->setPassword($req->input('password'));
                }
                $u->save();
                if ($req->has('role')) {
                    $u->syncRoles([$req->input('role')]);
                }
                return response()->json(['status' => 'ok', 'message' => 'User updated']);
            })->where('id', '[0-9]+');

            Route::delete('{id}', function ($id) {
                $u = \App\Models\User::findOrFail($id);
                if ($u->user_id === \Auth::id()) {
                    return response()->json(['status' => 'error', 'message' => 'Cannot delete yourself'], 403);
                }
                $u->delete();
                return response()->json(['status' => 'ok', 'message' => 'User deleted']);
            })->where('id', '[0-9]+');

            // API tokens
            Route::get('{id}/tokens', function ($id) {
                $u = \App\Models\User::findOrFail($id);
                $tokens = $u->apiTokens->map(fn ($t) => [
                    'id'          => $t->id,
                    'description' => $t->description,
                    'disabled'    => (bool) $t->disabled,
                    'token_preview' => substr($t->token_hash, 0, 8) . '...',
                ]);
                return response()->json(['status' => 'ok', 'tokens' => $tokens]);
            })->where('id', '[0-9]+');

            Route::post('{id}/tokens', function (\Illuminate\Http\Request $req, $id) {
                $req->validate(['description' => 'required|string|max:100']);
                $u = \App\Models\User::findOrFail($id);
                $token = \Illuminate\Support\Str::random(64);
                $t = $u->apiTokens()->create([
                    'token_hash'  => hash('sha256', $token),
                    'description' => $req->input('description'),
                    'disabled'    => 0,
                ]);
                // Return plain token once — never stored in plain text
                return response()->json(['status' => 'ok', 'token' => $token, 'id' => $t->id], 201);
            })->where('id', '[0-9]+');

            Route::delete('{id}/tokens/{tokenId}', function ($id, $tokenId) {
                $u = \App\Models\User::findOrFail($id);
                $u->apiTokens()->where('id', $tokenId)->delete();
                return response()->json(['status' => 'ok', 'message' => 'Token deleted']);
            })->where('id', '[0-9]+')->where('tokenId', '[0-9]+');
        });

        Route::prefix('devices')->group(function (): void {
            Route::post('', [App\Api\Controllers\LegacyApiController::class, 'add_device'])->name('add_device');
            Route::delete('{hostname}', [App\Api\Controllers\LegacyApiController::class, 'del_device'])->name('del_device');
            Route::patch('{hostname}', [App\Api\Controllers\LegacyApiController::class, 'update_device'])->name('update_device_field');
            Route::patch('{hostname}/rename/{new_hostname}', [App\Api\Controllers\LegacyApiController::class, 'rename_device'])->name('rename_device');
            Route::post('{hostname}/components/{type}', [App\Api\Controllers\LegacyApiController::class, 'add_components'])->name('add_components');
            Route::put('{hostname}/components', [App\Api\Controllers\LegacyApiController::class, 'edit_components'])->name('edit_components');
            Route::delete('{hostname}/components/{component}', [App\Api\Controllers\LegacyApiController::class, 'delete_components'])->name('delete_components');
            Route::post('{hostname}/maintenance', [App\Api\Controllers\LegacyApiController::class, 'maintenance_device'])->name('maintenance_device');
        });

        Route::prefix('devicegroups')->group(function (): void {
            Route::patch('{name}', [App\Api\Controllers\LegacyApiController::class, 'update_device_group'])->name('update_device_group');
            Route::delete('{name}', [App\Api\Controllers\LegacyApiController::class, 'delete_device_group'])->name('delete_device_group');
            Route::post('{name}/devices', [App\Api\Controllers\LegacyApiController::class, 'update_device_group_add_devices'])->name('update_device_group_add_devices');
            Route::delete('{name}/devices', [App\Api\Controllers\LegacyApiController::class, 'update_device_group_remove_devices'])->name('update_device_group_remove_devices');
            Route::post('{name}/maintenance', [App\Api\Controllers\LegacyApiController::class, 'maintenance_devicegroup'])->name('maintenance_devicegroup');
        });

        Route::post('bills', [App\Api\Controllers\LegacyApiController::class, 'create_edit_bill'])->name('create_bill');
        Route::delete('bills/{bill_id}', [App\Api\Controllers\LegacyApiController::class, 'delete_bill'])->name('delete_bill');
        Route::put('alerts/{id}', [App\Api\Controllers\LegacyApiController::class, 'ack_alert'])->name('ack_alert');
        Route::put('alerts/unmute/{id}', [App\Api\Controllers\LegacyApiController::class, 'unmute_alert'])->name('unmute_alert');
        Route::post('alert_templates', [App\Api\Controllers\LegacyApiController::class, 'add_edit_alert_template'])->name('add_alert_template');
        Route::put('alert_templates', [App\Api\Controllers\LegacyApiController::class, 'add_edit_alert_template'])->name('edit_alert_template');
        // Route::delete('alert_templates/{id}', [App\Api\Controllers\LegacyApiController::class, 'delete_alert_template'])->name('delete_alert_template');
        Route::post('rules', [App\Api\Controllers\LegacyApiController::class, 'add_edit_rule'])->name('add_rule');
        Route::put('rules', [App\Api\Controllers\LegacyApiController::class, 'add_edit_rule'])->name('edit_rule');
        Route::delete('rules/{id}', [App\Api\Controllers\LegacyApiController::class, 'delete_rule'])->name('delete_rule');
        Route::post('services/{hostname}', [App\Api\Controllers\LegacyApiController::class, 'add_service_for_host'])->name('add_service_for_host');
        Route::get('oxidized/config/search/{searchstring}', [App\Api\Controllers\LegacyApiController::class, 'search_oxidized'])->name('search_oxidized');
        Route::get('oxidized/config/{device_name}', [App\Api\Controllers\LegacyApiController::class, 'get_oxidized_config'])->name('get_oxidized_config');
        Route::post('devicegroups', [App\Api\Controllers\LegacyApiController::class, 'add_device_group'])->name('add_device_group');
        Route::patch('devices/{hostname}/port/{portid}', [App\Api\Controllers\LegacyApiController::class, 'update_device_port_notes'])->name('update_device_port_notes');
        Route::post('port_groups', [App\Api\Controllers\LegacyApiController::class, 'add_port_group'])->name('add_port_group');
        Route::post('port_groups/{port_group_id}/assign', [App\Api\Controllers\LegacyApiController::class, 'assign_port_group'])->name('assign_port_group');
        Route::post('port_groups/{port_group_id}/remove', [App\Api\Controllers\LegacyApiController::class, 'remove_port_group'])->name('remove_port_group');
        Route::post('devices/{id}/parents', [App\Api\Controllers\LegacyApiController::class, 'add_parents_to_host'])->name('add_parents_to_host');
        Route::delete('/devices/{id}/parents', [App\Api\Controllers\LegacyApiController::class, 'del_parents_from_host'])->name('del_parents_from_host');
        Route::post('locations', [App\Api\Controllers\LegacyApiController::class, 'add_location'])->name('add_location');
        Route::get('location/{location_id_or_name}', [App\Api\Controllers\LegacyApiController::class, 'get_location'])->name('get_location');
        Route::patch('locations/{location_id_or_name}', [App\Api\Controllers\LegacyApiController::class, 'edit_location'])->name('edit_location');
        Route::delete('locations/{location}', [App\Api\Controllers\LegacyApiController::class, 'del_location'])->name('del_location');
        Route::post('locations/{location}/maintenance', [App\Api\Controllers\LegacyApiController::class, 'maintenance_location'])->name('maintenance_location');
        Route::delete('services/{id}', [App\Api\Controllers\LegacyApiController::class, 'del_service_from_host'])->name('del_service_from_host');
        Route::patch('services/{id}', [App\Api\Controllers\LegacyApiController::class, 'edit_service_for_host'])->name('edit_service_for_host');
        Route::post('bgp/{id}', [App\Api\Controllers\LegacyApiController::class, 'edit_bgp_descr'])->name('edit_bgp_descr');
        Route::post('syslogsink', [App\Api\Controllers\LegacyApiController::class, 'post_syslogsink'])->name('post_syslogsink');

        Route::get('poller_group/{poller_group_id_or_name?}', [App\Api\Controllers\LegacyApiController::class, 'get_poller_group'])->name('get_poller_group');
    });

    // restricted by access
    Route::prefix('devices')->group(function (): void {
        Route::get('{hostname}', [App\Api\Controllers\LegacyApiController::class, 'get_device'])->name('get_device');
        Route::get('{hostname}/discover', [App\Api\Controllers\LegacyApiController::class, 'trigger_device_discovery'])->name('trigger_device_discovery');
        Route::get('{hostname}/availability', [App\Api\Controllers\LegacyApiController::class, 'device_availability'])->name('device_availability');
        Route::get('{hostname}/outages', [App\Api\Controllers\LegacyApiController::class, 'device_outages'])->name('device_outages');
        Route::get('{hostname}/graphs/health/{type}/{sensor_id?}', [App\Api\Controllers\LegacyApiController::class, 'get_graph_generic_by_hostname'])->name('get_health_graph');
        Route::get('{hostname}/graphs/wireless/{type}/{sensor_id?}', [App\Api\Controllers\LegacyApiController::class, 'get_graph_generic_by_hostname'])->name('get_wireless_graph');
        Route::get('{hostname}/vlans', [App\Api\Controllers\LegacyApiController::class, 'get_vlans'])->name('get_vlans');
        Route::get('{hostname}/links', [App\Api\Controllers\LegacyApiController::class, 'list_links'])->name('list_links_device');
        Route::get('{hostname}/graphs', [App\Api\Controllers\LegacyApiController::class, 'get_graphs'])->name('get_graphs');
        Route::get('{hostname}/fdb', [App\Api\Controllers\LegacyApiController::class, 'get_fdb'])->name('get_fdb');
        Route::get('{hostname}/nac', [App\Api\Controllers\LegacyApiController::class, 'get_nac'])->name('get_nac');
        Route::get('{hostname}/health/{type?}/{sensor_id?}', [App\Api\Controllers\LegacyApiController::class, 'list_available_health_graphs'])->name('list_available_health_graphs');
        Route::get('{hostname}/wireless/{type?}/{sensor_id?}', [App\Api\Controllers\LegacyApiController::class, 'list_available_wireless_graphs'])->name('list_available_wireless_graphs');
        Route::get('{hostname}/ports', [App\Api\Controllers\LegacyApiController::class, 'get_device_ports'])->name('get_device_ports');
        Route::get('{hostname}/ip', [App\Api\Controllers\LegacyApiController::class, 'get_device_ip_addresses'])->name('get_ip_addresses');
        Route::get('{hostname}/port_stack', [App\Api\Controllers\LegacyApiController::class, 'get_port_stack'])->name('get_port_stack');
        Route::get('{hostname}/transceivers', [App\Api\Controllers\LegacyApiController::class, 'get_transceivers'])->name('get_transceivers');
        Route::get('{hostname}/components', [App\Api\Controllers\LegacyApiController::class, 'get_components'])->name('get_components');
        Route::get('{hostname}/groups', [App\Api\Controllers\LegacyApiController::class, 'get_device_groups'])->name('get_device_groups_device');
        Route::get('{hostname}/maintenance', [App\Api\Controllers\LegacyApiController::class, 'device_under_maintenance'])->name('device_under_maintenance');
        // consumes the route below, but passes to it when detected
        Route::get('{hostname}/ports/{ifname}', [App\Api\Controllers\LegacyApiController::class, 'get_port_stats_by_port_hostname'])->name('get_port_stats_by_port_hostname')->where('ifname', '.*');
        Route::get('{hostname}/ports/{ifname}/{type}', [App\Api\Controllers\LegacyApiController::class, 'get_graph_by_port_hostname'])->name('get_graph_by_port_hostname');
        Route::get('{hostname}/services/{id}/graphs/{datasource}', [App\Api\Controllers\LegacyApiController::class, 'get_graph_by_service'])->name('get_graph_by_service');
        Route::post('{hostname}/eventlog', [App\Api\Controllers\LegacyApiController::class, 'add_eventlog'])->name('add_eventlog');
        Route::get('{hostname}/{type}', [App\Api\Controllers\LegacyApiController::class, 'get_graph_generic_by_hostname'])->name('get_graph_generic_by_hostname');
        Route::get('', [App\Api\Controllers\LegacyApiController::class, 'list_devices'])->name('list_devices');
    });

    Route::prefix('ports')->group(function (): void {
        Route::get('{portid}', [App\Api\Controllers\LegacyApiController::class, 'get_port_info'])->name('get_port_info');
        Route::get('{portid}/fdb', [App\Api\Controllers\LegacyApiController::class, 'get_port_fdb'])->name('get_port_fdb');
        Route::get('{portid}/ip', [App\Api\Controllers\LegacyApiController::class, 'get_port_ip_addresses'])->name('get_port_ip_info');
        Route::get('{portid}/transceiver', [App\Api\Controllers\LegacyApiController::class, 'get_port_transceiver'])->name('get_port_transceiver');
        Route::patch('transceiver/metric/{metric}', [App\Api\Controllers\LegacyApiController::class, 'update_transceiver_metric_thresholds'])->name('update_transceiver_metric_thresholds');
        Route::get('search/{field}/{search?}', [App\Api\Controllers\LegacyApiController::class, 'search_ports'])->name('search_ports')->where('search', '.*');
        Route::get('mac/{search}', [App\Api\Controllers\LegacyApiController::class, 'search_by_mac'])->name('search_mac');
        Route::get('', [App\Api\Controllers\LegacyApiController::class, 'get_all_ports'])->name('get_all_ports');
        Route::get('{portid}/description', [App\Api\Controllers\LegacyApiController::class, 'get_port_description'])->name('get_port_description');
        Route::patch('{portid}/description', [App\Api\Controllers\LegacyApiController::class, 'update_port_description'])->name('update_port_description');
    });

    Route::prefix('bills')->group(function (): void {
        Route::get('', [App\Api\Controllers\LegacyApiController::class, 'list_bills'])->name('list_bills');
        Route::get('{bill_id}', [App\Api\Controllers\LegacyApiController::class, 'list_bills'])->name('get_bill');
        Route::get('{bill_id}/graphs/{graph_type}', [App\Api\Controllers\LegacyApiController::class, 'get_bill_graph'])->name('get_bill_graph');
        Route::get('{bill_id}/graphdata/{graph_type}', [App\Api\Controllers\LegacyApiController::class, 'get_bill_graphdata'])->name('get_bill_graphdata');
        Route::get('{bill_id}/history', [App\Api\Controllers\LegacyApiController::class, 'get_bill_history'])->name('get_bill_history');
        Route::get('{bill_id}/history/{bill_hist_id}/graphs/{graph_type}', [App\Api\Controllers\LegacyApiController::class, 'get_bill_history_graph'])->name('get_bill_history_graph');
        Route::get('{bill_id}/history/{bill_hist_id}/graphdata/{graph_type}', [App\Api\Controllers\LegacyApiController::class, 'get_bill_history_graphdata'])->name('get_bill_history_graphdata');
    });

    Route::prefix('routing')->group(function (): void {
        Route::get('bgp/cbgp', [App\Api\Controllers\LegacyApiController::class, 'list_cbgp'])->name('list_cbgp');
        Route::get('vrf', [App\Api\Controllers\LegacyApiController::class, 'list_vrf'])->name('list_vrf');
        Route::get('mpls/services', [App\Api\Controllers\LegacyApiController::class, 'list_mpls_services'])->name('list_mpls_services');
        Route::get('mpls/saps', [App\Api\Controllers\LegacyApiController::class, 'list_mpls_saps'])->name('list_mpls_saps');
    });

    Route::prefix('resources')->group(function (): void {
        Route::get('fdb', [App\Api\Controllers\LegacyApiController::class, 'list_fdb'])->name('list_fdb');
        Route::get('fdb/{mac}', [App\Api\Controllers\LegacyApiController::class, 'list_fdb'])->name('list_fdb_mac');
        Route::get('fdb/{mac}/detail', [App\Api\Controllers\LegacyApiController::class, 'list_fdb_detail'])->name('list_fdb_detail');
        Route::get('links', [App\Api\Controllers\LegacyApiController::class, 'list_links'])->name('list_links');
        Route::get('nac', [App\Api\Controllers\LegacyApiController::class, 'list_nac'])->name('list_nac');
        Route::get('nac/{mac}', [App\Api\Controllers\LegacyApiController::class, 'list_nac'])->name('list_nac_mac');
        Route::get('sensors', [App\Api\Controllers\LegacyApiController::class, 'list_sensors'])->name('list_sensors');
        Route::get('vlans', [App\Api\Controllers\LegacyApiController::class, 'list_vlans'])->name('list_vlans');
    });

    Route::get('inventory/{hostname}', [App\Api\Controllers\LegacyApiController::class, 'get_inventory'])->name('get_inventory');
    Route::get('inventory/{hostname}/all', [App\Api\Controllers\LegacyApiController::class, 'get_inventory_for_device'])->name('get_inventory_for_device');

    Route::prefix('port_security')->group(function (): void {
        Route::get('port/{portid}', [App\Api\Controllers\LegacyApiController::class, 'get_port_security'])->name('get_port_security_by_port');
        Route::get('device/{hostname}', [App\Api\Controllers\LegacyApiController::class, 'get_port_security'])->name('get_port_security_by_hostname');
        Route::get('', [App\Api\Controllers\LegacyApiController::class, 'get_port_security'])->name('get_port_security');
    });
    // ── Device Templates CRUD ─────────────────────────────────────
    Route::prefix('device-templates')->group(function (): void {

        Route::get('', function (\Illuminate\Http\Request $req) {
            $q = \DB::table('device_templates')->orderBy('vendor')->orderBy('name');
            if ($req->filled('vendor')) $q->where('vendor', $req->input('vendor'));
            if ($req->filled('type'))   $q->where('type',   $req->input('type'));
            if ($req->filled('search')) $q->where(function ($s) use ($req) {
                $s->where('name', 'like', '%'.$req->input('search').'%')
                  ->orWhere('vendor', 'like', '%'.$req->input('search').'%')
                  ->orWhere('os_name', 'like', '%'.$req->input('search').'%');
            });
            return response()->json(['status' => 'ok', 'templates' => $q->get()]);
        });

        Route::get('{id}', function ($id) {
            $t = \DB::table('device_templates')->find($id);
            if (!$t) return response()->json(['status' => 'error', 'message' => 'Not found'], 404);
            return response()->json(['status' => 'ok', 'template' => $t]);
        })->where('id', '[0-9]+');

        Route::post('', function (\Illuminate\Http\Request $req) {
            $req->validate([
                'name'    => 'required|string|max:255',
                'os_name' => 'required|string|max:100|unique:device_templates,os_name',
                'vendor'  => 'nullable|string|max:100',
                'type'    => 'nullable|in:network,server,camera,printer,ups,other',
            ]);
            $id = \DB::table('device_templates')->insertGetId([
                'name'               => $req->input('name'),
                'os_name'            => $req->input('os_name'),
                'vendor'             => $req->input('vendor', ''),
                'display_name'       => $req->input('display_name', $req->input('name')),
                'type'               => $req->input('type', 'network'),
                'icon'               => $req->input('icon', ''),
                'description'        => $req->input('description', ''),
                'sys_object_ids'     => json_encode($req->input('sys_object_ids', [])),
                'sys_descr_patterns' => json_encode($req->input('sys_descr_patterns', [])),
                'mib_dirs'           => json_encode($req->input('mib_dirs', [])),
                'modules'            => json_encode($req->input('modules', [])),
                'custom_oids'        => json_encode($req->input('custom_oids', [])),
                'builtin'            => false,
                'created_at'         => now(),
                'updated_at'         => now(),
            ]);
            return response()->json(['status' => 'ok', 'message' => 'Template created', 'id' => $id], 201);
        });

        Route::put('{id}', function (\Illuminate\Http\Request $req, $id) {
            $t = \DB::table('device_templates')->find($id);
            if (!$t) return response()->json(['status' => 'error', 'message' => 'Not found'], 404);
            $req->validate([
                'name'    => 'required|string|max:255',
                'os_name' => 'required|string|max:100|unique:device_templates,os_name,'.$id,
            ]);
            \DB::table('device_templates')->where('id', $id)->update([
                'name'               => $req->input('name'),
                'os_name'            => $req->input('os_name'),
                'vendor'             => $req->input('vendor', ''),
                'display_name'       => $req->input('display_name', $req->input('name')),
                'type'               => $req->input('type', 'network'),
                'icon'               => $req->input('icon', ''),
                'description'        => $req->input('description', ''),
                'sys_object_ids'     => json_encode($req->input('sys_object_ids', [])),
                'sys_descr_patterns' => json_encode($req->input('sys_descr_patterns', [])),
                'mib_dirs'           => json_encode($req->input('mib_dirs', [])),
                'modules'            => json_encode($req->input('modules', [])),
                'custom_oids'        => json_encode($req->input('custom_oids', [])),
                'updated_at'         => now(),
            ]);
            return response()->json(['status' => 'ok', 'message' => 'Template updated']);
        })->where('id', '[0-9]+');

        Route::delete('{id}', function ($id) {
            $t = \DB::table('device_templates')->find($id);
            if (!$t) return response()->json(['status' => 'error', 'message' => 'Not found'], 404);
            if ($t->builtin) return response()->json(['status' => 'error', 'message' => 'Cannot delete built-in template'], 403);
            \DB::table('device_templates')->delete($id);
            return response()->json(['status' => 'ok', 'message' => 'Template deleted']);
        })->where('id', '[0-9]+');
    });

    // ── MIB Files CRUD + upload ───────────────────────────────────
    Route::prefix('mib-files')->group(function (): void {

        Route::get('', function (\Illuminate\Http\Request $req) {
            $q = \DB::table('mib_files')->orderBy('vendor')->orderBy('filename');
            if ($req->filled('vendor')) $q->where('vendor', $req->input('vendor'));
            return response()->json([
                'status'   => 'ok',
                'mibs'     => $q->get(['id','filename','vendor','mib_name','size','valid','parse_error','created_at']),
            ]);
        });

        // Upload MIB file (multipart or raw text body)
        Route::post('', function (\Illuminate\Http\Request $req) {
            $req->validate([
                'vendor'   => 'required|string|max:100',
                'filename' => 'required|string|max:255',
                'content'  => 'required|string',
            ]);

            $vendor   = strtolower(trim($req->input('vendor')));
            $filename = trim($req->input('filename'));
            $content  = $req->input('content');

            // Try to extract MIB module name from content
            preg_match('/^(\S+)\s+DEFINITIONS\s*::=\s*BEGIN/mi', $content, $m);
            $mibName = $m[1] ?? pathinfo($filename, PATHINFO_FILENAME);

            // Validate by writing to temp and running snmptranslate
            $tmpDir  = sys_get_temp_dir().'/updive_mibs_'.$vendor;
            @mkdir($tmpDir, 0755, true);
            $tmpFile = $tmpDir.'/'.$filename;
            file_put_contents($tmpFile, $content);

            $valid      = false;
            $parseError = null;
            $mibPath    = '/opt/updive-nsm/mibs';
            $safeVendor  = escapeshellarg("{$mibPath}/{$vendor}:{$tmpDir}");
            $safeMibName = escapeshellarg($mibName);
            exec("snmptranslate -M {$safeVendor} -m {$safeMibName} {$safeMibName}::. 2>&1", $out, $code);
            if ($code === 0) {
                $valid = true;
                // Also save to the actual mibs directory
                $destDir = "/opt/updive-nsm/mibs/{$vendor}";
                @mkdir($destDir, 0755, true);
                file_put_contents("{$destDir}/{$filename}", $content);
            } else {
                $parseError = implode("\n", array_slice($out, 0, 5));
            }
            @unlink($tmpFile);

            $id = \DB::table('mib_files')->updateOrInsert(
                ['vendor' => $vendor, 'filename' => $filename],
                [
                    'mib_name'    => $mibName,
                    'content'     => $content,
                    'size'        => strlen($content),
                    'valid'       => $valid,
                    'parse_error' => $parseError,
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ]
            );

            return response()->json([
                'status'      => 'ok',
                'message'     => $valid ? 'MIB uploaded and validated' : 'MIB uploaded (parse warning)',
                'mib_name'    => $mibName,
                'valid'       => $valid,
                'parse_error' => $parseError,
            ], 201);
        });

        Route::get('{id}', function ($id) {
            $m = \DB::table('mib_files')->find($id);
            if (!$m) return response()->json(['status' => 'error', 'message' => 'Not found'], 404);
            return response()->json(['status' => 'ok', 'mib' => $m]);
        })->where('id', '[0-9]+');

        Route::post('{id}/validate', function ($id) {
            $m = \DB::table('mib_files')->find($id);
            if (!$m) return response()->json(['status' => 'error', 'message' => 'Not found'], 404);
            $mibPath     = '/opt/updive-nsm/mibs';
            $safeVendor  = escapeshellarg("{$mibPath}/{$m->vendor}");
            $safeMibName = escapeshellarg($m->mib_name);
            exec("snmptranslate -M {$safeVendor} -m {$safeMibName} {$safeMibName}::. 2>&1", $out, $code);
            $valid = ($code === 0);
            $err   = $valid ? null : implode("\n", array_slice($out, 0, 5));
            \DB::table('mib_files')->where('id', $id)->update(['valid' => $valid, 'parse_error' => $err, 'updated_at' => now()]);
            return response()->json(['status' => 'ok', 'valid' => $valid, 'parse_error' => $err]);
        })->where('id', '[0-9]+');

        Route::delete('{id}', function ($id) {
            $m = \DB::table('mib_files')->find($id);
            if (!$m) return response()->json(['status' => 'error', 'message' => 'Not found'], 404);
            // Remove from filesystem too
            $dest = "/opt/updive-nsm/mibs/{$m->vendor}/{$m->filename}";
            if (file_exists($dest)) @unlink($dest);
            \DB::table('mib_files')->delete($id);
            return response()->json(['status' => 'ok', 'message' => 'MIB deleted']);
        })->where('id', '[0-9]+');
    });

    // ── Auto-Discovery ────────────────────────────────────────────────────────
    // GET /api/v0/discovery/candidates
    // Returns IPs from ARP/ipv4 tables not yet in the devices table
    Route::get('discovery/candidates', function () {
        $knownIps = \DB::table('devices')->pluck('hostname')->merge(\DB::table('devices')->pluck('ip'))->filter()->unique()->values();

        // ARP-based candidates
        $arpCandidates = \DB::table('ipv4_mac as m')
            ->join('devices as d', 'd.device_id', '=', 'm.device_id')
            ->select('m.ipv4_address as ip', 'm.mac_address as mac', 'd.hostname as seen_on', 'd.sysName as seen_on_name')
            ->whereNotNull('m.ipv4_address')
            ->where('m.ipv4_address', '!=', '0.0.0.0')
            ->orderBy('m.ipv4_address')
            ->get()
            ->filter(fn ($r) => ! $knownIps->contains($r->ip))
            ->unique('ip')
            ->values()
            ->map(fn ($r) => ['ip' => $r->ip, 'mac' => $r->mac, 'source' => 'arp', 'seen_on' => $r->seen_on_name ?: $r->seen_on]);

        // LLDP neighbor candidates (from links table)
        $lldpCandidates = \DB::table('links as l')
            ->join('devices as d', 'd.device_id', '=', 'l.local_device_id')
            ->select('l.remote_hostname as ip', 'l.remote_platform as platform', 'd.hostname as seen_on', 'd.sysName as seen_on_name', 'l.protocol')
            ->where('l.active', 1)
            ->whereNotNull('l.remote_hostname')
            ->get()
            ->filter(fn ($r) => ! $knownIps->contains($r->ip))
            ->unique('ip')
            ->values()
            ->map(fn ($r) => ['ip' => $r->ip, 'mac' => null, 'source' => strtolower($r->protocol ?? 'lldp'), 'platform' => $r->platform, 'seen_on' => $r->seen_on_name ?: $r->seen_on]);

        $candidates = $arpCandidates->merge($lldpCandidates)->unique('ip')->values();

        return response()->json([
            'status'     => 'ok',
            'count'      => $candidates->count(),
            'candidates' => $candidates,
        ]);
    });

    // GET /api/v0/discovery/community-pool
    Route::get('discovery/community-pool', function () {
        $val = \DB::table('config')->where('config_name', 'discovery.community_pool')->value('config_value');
        $pool = $val ? json_decode($val, true) : ['public', 'private'];
        return response()->json(['status' => 'ok', 'pool' => $pool]);
    });

    // POST /api/v0/discovery/community-pool
    Route::post('discovery/community-pool', function (\Illuminate\Http\Request $req) {
        $req->validate(['pool' => 'required|array|min:1', 'pool.*' => 'string|max:64']);
        $pool = array_values(array_unique($req->input('pool')));
        \DB::table('config')->updateOrInsert(
            ['config_name' => 'discovery.community_pool'],
            ['config_value' => json_encode($pool)]
        );
        return response()->json(['status' => 'ok', 'pool' => $pool]);
    });

    // POST /api/v0/discovery/cidr-scan
    // fping scan + SNMP probe with community pool
    Route::post('discovery/cidr-scan', function (\Illuminate\Http\Request $req) {
        $req->validate(['cidr' => ['required', 'string', 'regex:/^[\d\.\/]+$/']]);

        $cidr   = $req->input('cidr');
        $portNo = (int) $req->input('port', 161);
        $limit  = min((int) $req->input('limit', 254), 512);

        // Get community pool from config
        $val  = \DB::table('config')->where('config_name', 'discovery.community_pool')->value('config_value');
        $pool = $val ? json_decode($val, true) : ['public'];

        // Known devices to mark already-monitored
        $knownIps = \DB::table('devices')->pluck('hostname')->merge(\DB::table('devices')->pluck('ip'))->filter()->unique();

        // Run fping
        $cmd = 'fping -a -g ' . escapeshellarg($cidr) . ' -t 500 -r 1 2>/dev/null';
        exec($cmd, $liveHosts, $exitCode);
        $liveHosts = array_slice(array_filter($liveHosts), 0, $limit);

        $results = [];
        foreach ($liveHosts as $host) {
            $host = trim($host);
            if (! $host) continue;

            $entry = [
                'ip'          => $host,
                'ping'        => true,
                'snmp'        => false,
                'community'   => null,
                'sysdescr'    => null,
                'monitored'   => $knownIps->contains($host),
            ];

            // Try each community string
            foreach ($pool as $community) {
                $target = escapeshellarg("udp:{$host}/{$portNo}");
                $r = [];
                exec("snmpget -v2c -c " . escapeshellarg($community) . " -r 0 -t 2 {$target} SNMPv2-MIB::sysDescr.0 2>/dev/null", $r);
                $out = implode(' ', $r);
                if (str_contains($out, 'STRING')) {
                    preg_match('/STRING:\s*(.+)$/', $out, $m);
                    $entry['snmp']      = true;
                    $entry['community'] = $community;
                    $entry['sysdescr']  = isset($m[1]) ? trim($m[1]) : null;
                    break;
                }
            }

            $results[] = $entry;
        }

        return response()->json([
            'status'  => 'ok',
            'scanned' => count($results),
            'alive'   => count(array_filter($results, fn($r) => $r['ping'])),
            'snmp'    => count(array_filter($results, fn($r) => $r['snmp'])),
            'results' => $results,
        ]);
    });

    // ── Anomaly Detection & Forecasting ──────────────────────────────────────
    Route::get('anomaly', function (\Illuminate\Http\Request $req) {
        $limit = min((int) $req->query('limit', 50), 200);

        // Forecasts: ports/CPU approaching limits, soonest first
        $forecasts = \DB::table('metric_forecasts')
            ->join('devices', 'devices.device_id', '=', 'metric_forecasts.device_id')
            ->whereNotNull('metric_forecasts.days_until_limit')
            ->where('metric_forecasts.days_until_limit', '<=', 90)
            ->where('metric_forecasts.r_squared', '>=', 0.05)
            ->where('devices.ignore', 0)
            ->orderBy('metric_forecasts.days_until_limit')
            ->limit($limit)
            ->select([
                'metric_forecasts.*',
                'devices.hostname', 'devices.sysName', 'devices.display',
            ])
            ->get()
            ->map(function ($f) {
                $pct = $f->limit_value > 0
                    ? round($f->current_value / $f->limit_value * 100, 1)
                    : null;
                $f->usage_pct    = $pct;
                $f->device_label = $f->display ?: $f->sysName ?: $f->hostname;
                return $f;
            });

        // Recent anomalies from eventlog
        $anomalies = \DB::table('eventlog')
            ->join('devices', 'devices.device_id', '=', 'eventlog.device_id')
            ->where('eventlog.type', 'anomaly')
            ->where('eventlog.datetime', '>=', now()->subHours(24))
            ->orderByDesc('eventlog.datetime')
            ->limit($limit)
            ->select([
                'eventlog.event_id', 'eventlog.device_id', 'eventlog.datetime',
                'eventlog.message', 'eventlog.reference',
                'devices.hostname', 'devices.sysName', 'devices.display',
            ])
            ->get();

        // Summary stats
        $stats = [
            'forecasts_total'     => \DB::table('metric_forecasts')->whereNotNull('days_until_limit')->count(),
            'critical_7d'         => \DB::table('metric_forecasts')->whereBetween('days_until_limit', [0, 7])->count(),
            'warning_30d'         => \DB::table('metric_forecasts')->whereBetween('days_until_limit', [7, 30])->count(),
            'anomalies_24h'       => \DB::table('eventlog')->where('type', 'anomaly')->where('datetime', '>=', now()->subHours(24))->count(),
            'baselines_built'     => \DB::table('anomaly_baselines')->count(),
        ];

        return response()->json([
            'status'    => 'ok',
            'stats'     => $stats,
            'forecasts' => $forecasts,
            'anomalies' => $anomalies,
        ]);
    });

    // ── Reports ───────────────────────────────────────────────────────────────
    Route::get('reports/{type}', function (string $type, \Illuminate\Http\Request $req) {
        $format = strtolower($req->query('format', 'excel')); // pdf | excel
        $days   = max(1, min(365, (int) $req->query('days', 30)));
        $limit  = max(1, min(500, (int) $req->query('limit', 50)));

        // ── Collect data ─────────────────────────────────────────────────────
        $data = match ($type) {

            'devices' => \DB::table('devices')
                ->where('ignore', 0)
                ->orderBy('hostname')
                ->get(['device_id','hostname','sysName','display','status','os','uptime','last_polled','location_id'])
                ->map(fn ($d) => [
                    'IP / Hostname' => $d->hostname,
                    'Nomi'          => $d->display ?: $d->sysName ?: '',
                    'OS'            => $d->os ?? '—',
                    'Holat'         => $d->status ? 'UP' : 'DOWN',
                    'Uptime (soat)' => $d->uptime ? round($d->uptime / 3600, 1) : '—',
                    'Oxirgi polling'=> $d->last_polled ?? '—',
                ])->toArray(),

            'ports' => \DB::table('ports')
                ->join('devices', 'devices.device_id', '=', 'ports.device_id')
                ->where('devices.ignore', 0)
                ->whereNotNull('ports.ifInOctets_rate')
                ->orderByDesc(\DB::raw('(COALESCE(ports.ifInOctets_rate,0) + COALESCE(ports.ifOutOctets_rate,0))'))
                ->limit($limit)
                ->get(['devices.hostname','ports.ifName','ports.ifAlias','ports.ifOperStatus',
                       'ports.ifSpeed','ports.ifInOctets_rate','ports.ifOutOctets_rate'])
                ->map(fn ($p) => [
                    'Qurilma'      => $p->hostname,
                    'Port'         => $p->ifName,
                    'Tavsif'       => $p->ifAlias ?? '—',
                    'Holat'        => $p->ifOperStatus,
                    'Tezlik (Mbps)'=> $p->ifSpeed ? round($p->ifSpeed / 1e6) : '—',
                    'In (Mbps)'    => $p->ifInOctets_rate  ? round($p->ifInOctets_rate  * 8 / 1e6, 3) : 0,
                    'Out (Mbps)'   => $p->ifOutOctets_rate ? round($p->ifOutOctets_rate * 8 / 1e6, 3) : 0,
                    'Utilization %'=> ($p->ifSpeed && $p->ifSpeed > 0)
                        ? round((($p->ifInOctets_rate ?? 0) + ($p->ifOutOctets_rate ?? 0)) * 8 / $p->ifSpeed * 100, 1)
                        : '—',
                ])->toArray(),

            'alerts' => \DB::table('alert_log as al')
                ->join('alert_rules as ar', 'ar.id', '=', 'al.rule_id')
                ->join('devices as d', 'd.device_id', '=', 'al.device_id')
                ->where('al.time_logged', '>=', now()->subDays($days))
                ->orderByDesc('al.time_logged')
                ->limit($limit)
                ->get(['al.time_logged','d.hostname','ar.name as rule','al.state'])
                ->map(fn ($a) => [
                    'Vaqt'     => $a->time_logged,
                    'Qurilma'  => $a->hostname,
                    'Qoida'    => $a->rule,
                    'Holat'    => match ((int) $a->state) { 1 => 'Fired', 0 => 'Cleared', 2 => 'ACK', default => 'Unknown' },
                ])->toArray(),

            'uptime' => \DB::table('devices')
                ->where('ignore', 0)
                ->orderByDesc('uptime')
                ->get(['hostname','display','sysName','status','uptime'])
                ->map(function ($d) {
                    $thirtyDays = 30 * 24 * 3600;
                    $sla = $d->uptime ? min(100, round($d->uptime / $thirtyDays * 100, 2)) : 0;
                    return [
                        'Qurilma'        => $d->display ?: $d->sysName ?: $d->hostname,
                        'IP'             => $d->hostname,
                        'Holat'          => $d->status ? 'UP' : 'DOWN',
                        'Uptime (soat)'  => $d->uptime ? round($d->uptime / 3600, 1) : 0,
                        'SLA 30 kun (%)'=> $sla,
                    ];
                })->toArray(),

            'top-traffic' => \DB::table('devices as d')
                ->join('ports as p', 'p.device_id', '=', 'd.device_id')
                ->where('d.ignore', 0)
                ->whereNotNull('p.ifInOctets_rate')
                ->selectRaw('d.hostname, d.display, d.sysName,
                    SUM(COALESCE(p.ifInOctets_rate,0))  as total_in,
                    SUM(COALESCE(p.ifOutOctets_rate,0)) as total_out,
                    SUM(CASE WHEN p.ifOperStatus="up" THEN 1 ELSE 0 END) as ports_up,
                    COUNT(p.port_id) as ports_total')
                ->groupBy('d.device_id','d.hostname','d.display','d.sysName')
                ->orderByDesc(\DB::raw('SUM(COALESCE(p.ifInOctets_rate,0)) + SUM(COALESCE(p.ifOutOctets_rate,0))'))
                ->limit($limit)
                ->get()
                ->map(fn ($r) => [
                    'Qurilma'       => $r->display ?: $r->sysName ?: $r->hostname,
                    'IP'            => $r->hostname,
                    'In (Mbps)'     => round($r->total_in  * 8 / 1e6, 2),
                    'Out (Mbps)'    => round($r->total_out * 8 / 1e6, 2),
                    'Jami (Mbps)'   => round(($r->total_in + $r->total_out) * 8 / 1e6, 2),
                    'Portlar'       => "{$r->ports_up}/{$r->ports_total}",
                ])->toArray(),

            default => null,
        };

        if ($data === null) {
            return response()->json(['message' => "Unknown report type: {$type}"], 404);
        }

        $titles = [
            'devices'     => 'Qurilma Holati Hisoboti',
            'ports'       => 'Port Utilization Hisoboti',
            'alerts'      => "Alert Tarixi ({$days} kun)",
            'uptime'      => 'Uptime SLA Hisoboti',
            'top-traffic' => "Top {$limit} Traffic Hisoboti",
        ];
        $title = $titles[$type] ?? ucfirst($type);
        $filename = $type . '_' . date('Y-m-d');

        // ── Excel ────────────────────────────────────────────────────────────
        if ($format === 'excel') {
            $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
            $sheet = $spreadsheet->getActiveSheet();
            $sheet->setTitle(substr($title, 0, 31));

            // Title row
            $sheet->setCellValue('A1', $title);
            $sheet->setCellValue('A2', 'Sana: ' . now()->format('Y-m-d H:i'));
            $sheet->mergeCells('A1:' . \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex(count($data[0] ?? ['x'])) . '1');

            // Style title
            $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(14);
            $sheet->getStyle('A1')->getAlignment()->setHorizontal('center');

            if (empty($data)) {
                $sheet->setCellValue('A3', 'Ma\'lumot topilmadi');
            } else {
                // Headers
                $headers = array_keys($data[0]);
                foreach ($headers as $ci => $h) {
                    $col = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($ci + 1);
                    $sheet->setCellValue($col . '3', $h);
                    $sheet->getStyle($col . '3')->getFont()->setBold(true);
                    $sheet->getStyle($col . '3')->getFill()
                        ->setFillType(\PhpOffice\PhpSpreadsheet\Style\Fill::FILL_SOLID)
                        ->getStartColor()->setRGB('E8ECF0');
                }

                // Data rows
                foreach ($data as $ri => $row) {
                    foreach (array_values($row) as $ci => $val) {
                        $col = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($ci + 1);
                        $sheet->setCellValue($col . ($ri + 4), $val);
                    }
                }

                // Auto-size columns
                foreach (range(1, count($headers)) as $ci) {
                    $sheet->getColumnDimensionByColumn($ci)->setAutoSize(true);
                }
            }

            $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);
            $tmpFile = tempnam(sys_get_temp_dir(), 'report_') . '.xlsx';
            $writer->save($tmpFile);

            return response()->download($tmpFile, $filename . '.xlsx', [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ])->deleteFileAfterSend(true);
        }

        // ── PDF ──────────────────────────────────────────────────────────────
        $headers = $data ? array_keys($data[0]) : [];
        $html = view()->make('reports.base', compact('title', 'headers', 'data', 'days'))->render();

        $dompdf = new \Dompdf\Dompdf([
            'isHtml5ParserEnabled' => true,
            'isRemoteEnabled'      => false,
            'defaultFont'          => 'DejaVu Sans',
            'chroot'               => base_path(),
        ]);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('a4', 'landscape');
        $dompdf->render();

        return response($dompdf->output(), 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $filename . '.pdf"',
        ]);
    })->where('type', '[a-z\-]+');

    // Route not found
    Route::any('/{path?}', [App\Api\Controllers\LegacyApiController::class, 'api_not_found'])->where('path', '.*');
});

// ─── API v1 — Alert endpoints (Zabbix-parity) ────────────────────────────────
// Completely separate from v0. Does not modify any v0 handler.
Route::prefix('v1')->group(function (): void {
    $ctrl = App\Api\Controllers\AlertV1Controller::class;

    // Alerts
    Route::get('alerts/stats',        [$ctrl, 'stats']);
    Route::get('alerts/{id}',         [$ctrl, 'show'])->where('id', '[0-9]+');
    Route::get('alerts',              [$ctrl, 'index']);
    Route::put('alerts/{id}/ack',     [$ctrl, 'ack'])->where('id', '[0-9]+');
    Route::put('alerts/{id}/unack',   [$ctrl, 'unack'])->where('id', '[0-9]+');
    Route::post('alerts/bulk',        [$ctrl, 'bulk']);

    // Alert Rules
    Route::get('alert-rules/{id}',           [$ctrl, 'showRule'])->where('id', '[0-9]+');
    Route::get('alert-rules',                [$ctrl, 'listRules']);
    Route::post('alert-rules',               [$ctrl, 'createRule']);
    Route::put('alert-rules/{id}',           [$ctrl, 'updateRule'])->where('id', '[0-9]+');
    Route::delete('alert-rules/{id}',        [$ctrl, 'deleteRule'])->where('id', '[0-9]+');
    Route::patch('alert-rules/{id}/toggle',  [$ctrl, 'toggleRule'])->where('id', '[0-9]+');

    // Alert Log
    Route::get('alert-log/{id}',  [$ctrl, 'showLog'])->where('id', '[0-9]+');
    Route::get('alert-log',       [$ctrl, 'alertLog']);

    // Transports
    Route::get('alert-transports/{id}',    [$ctrl, 'showTransport'])->where('id', '[0-9]+');
    Route::get('alert-transports',         [$ctrl, 'listTransports']);
    Route::post('alert-transports',        [$ctrl, 'createTransport']);
    Route::put('alert-transports/{id}',    [$ctrl, 'updateTransport'])->where('id', '[0-9]+');
    Route::delete('alert-transports/{id}', [$ctrl, 'deleteTransport'])->where('id', '[0-9]+');
});

// ─── API v2 — Alert API (production-grade, Alertmanager/Zabbix parity) ────────
// Completely isolated from v0 and v1. No existing code is modified.
Route::prefix('v2')->group(function (): void {
    $c = App\Api\Controllers\AlertV2Controller::class;

    // ── Alerts: read (no auth required beyond global-read) ───────────────────
    Route::get('alerts/stats',   [$c, 'stats']);
    Route::get('alerts/active',  [$c, 'active']);
    Route::get('alerts/grouped', [$c, 'grouped']);
    Route::get('alerts/{id}',    [$c, 'show'])->where('id', '[0-9]+');
    Route::get('alerts',         [$c, 'index']);

    // ── Alerts: single actions ────────────────────────────────────────────────
    Route::post('alerts/{id}/ack',    [$c, 'ack'])->where('id', '[0-9]+');
    Route::post('alerts/{id}/unack',  [$c, 'unack'])->where('id', '[0-9]+');
    Route::post('alerts/{id}/mute',   [$c, 'mute'])->where('id', '[0-9]+');
    Route::post('alerts/{id}/unmute', [$c, 'unmute'])->where('id', '[0-9]+');

    // ── Alerts: bulk operations ───────────────────────────────────────────────
    Route::post('alerts/bulk/ack',   [$c, 'bulkAck']);
    Route::post('alerts/bulk/unack', [$c, 'bulkUnack']);
    Route::post('alerts/bulk/mute',  [$c, 'bulkMute']);

    // ── Alert rules: full CRUD + toggle ──────────────────────────────────────
    Route::get('alert-rules/{id}',          [$c, 'showRule'])->where('id', '[0-9]+');
    Route::get('alert-rules',               [$c, 'listRules']);
    Route::post('alert-rules',              [$c, 'createRule']);
    Route::put('alert-rules/{id}',          [$c, 'updateRule'])->where('id', '[0-9]+');
    Route::delete('alert-rules/{id}',       [$c, 'deleteRule'])->where('id', '[0-9]+');
    Route::patch('alert-rules/{id}/toggle', [$c, 'toggleRule'])->where('id', '[0-9]+');

    // ── Alert log ─────────────────────────────────────────────────────────────
    Route::get('alert-log', [$c, 'alertLog']);

    // ── Transports: full CRUD ─────────────────────────────────────────────────
    Route::get('alert-transports/{id}',    [$c, 'showTransport'])->where('id', '[0-9]+');
    Route::get('alert-transports',         [$c, 'listTransports']);
    Route::post('alert-transports',        [$c, 'createTransport']);
    Route::put('alert-transports/{id}',    [$c, 'updateTransport'])->where('id', '[0-9]+');
    Route::delete('alert-transports/{id}', [$c, 'deleteTransport'])->where('id', '[0-9]+');

    // ── RBAC: roles & permissions ─────────────────────────────────────────────
    // GET  /api/v2/rbac/roles          — list all roles with permission counts & users
    Route::get('rbac/roles', function () {
        $roles = \Spatie\Permission\Models\Role::withCount(['permissions', 'users'])->get()
            ->map(fn ($r) => [
                'id'               => $r->id,
                'name'             => $r->name,
                'permissions_count'=> $r->permissions_count,
                'users_count'      => $r->users_count,
                'editable'         => ! in_array($r->name, ['super-admin']),
            ]);
        return response()->json(['roles' => $roles]);
    });

    // GET  /api/v2/rbac/roles/{id}     — role detail with permissions list
    Route::get('rbac/roles/{id}', function ($id) {
        $role = \Spatie\Permission\Models\Role::with('permissions')->findOrFail($id);
        return response()->json([
            'role' => [
                'id'          => $role->id,
                'name'        => $role->name,
                'permissions' => $role->permissions->pluck('name')->sort()->values(),
                'editable'    => ! in_array($role->name, ['super-admin']),
            ],
        ]);
    })->where('id', '[0-9]+');

    // POST /api/v2/rbac/roles          — create custom role
    Route::post('rbac/roles', function (\Illuminate\Http\Request $req) {
        $req->validate([
            'name'        => 'required|string|max:64|unique:roles,name',
            'permissions' => 'array',
            'permissions.*' => 'string|exists:permissions,name',
        ]);
        $role = \Spatie\Permission\Models\Role::create(['name' => $req->input('name'), 'guard_name' => 'web']);
        if ($req->filled('permissions')) {
            $role->syncPermissions($req->input('permissions'));
        }
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();
        return response()->json(['status' => 'ok', 'role' => ['id' => $role->id, 'name' => $role->name]], 201);
    });

    // PUT  /api/v2/rbac/roles/{id}     — update permissions of a role
    Route::put('rbac/roles/{id}', function ($id, \Illuminate\Http\Request $req) {
        $role = \Spatie\Permission\Models\Role::findOrFail($id);
        if ($role->name === 'super-admin') {
            return response()->json(['message' => 'super-admin rolini o\'zgartirib bo\'lmaydi'], 403);
        }
        $req->validate(['permissions' => 'required|array', 'permissions.*' => 'string|exists:permissions,name']);
        $role->syncPermissions($req->input('permissions'));
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();
        return response()->json(['status' => 'ok']);
    })->where('id', '[0-9]+');

    // DELETE /api/v2/rbac/roles/{id}   — delete custom role
    Route::delete('rbac/roles/{id}', function ($id) {
        $role = \Spatie\Permission\Models\Role::findOrFail($id);
        if (in_array($role->name, ['super-admin', 'admin', 'operator', 'viewer', 'global-read', 'user'])) {
            return response()->json(['message' => 'Tizim rolini o\'chirib bo\'lmaydi'], 403);
        }
        $role->delete();
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();
        return response()->json(['status' => 'ok']);
    })->where('id', '[0-9]+');

    // GET  /api/v2/rbac/permissions    — all permissions grouped by resource
    Route::get('rbac/permissions', function () {
        $perms = \Spatie\Permission\Models\Permission::orderBy('name')->pluck('name');
        $grouped = [];
        foreach ($perms as $p) {
            $parts    = explode('.', $p, 2);
            $resource = $parts[0];
            $action   = $parts[1] ?? $p;
            $grouped[$resource][] = $p;
        }
        return response()->json(['permissions' => $grouped]);
    });

    // GET  /api/v2/rbac/users          — users with their roles
    Route::get('rbac/users', function () {
        $users = \App\Models\User::with('roles')->get()->map(fn ($u) => [
            'id'       => $u->user_id,
            'username' => $u->username,
            'realname' => $u->realname,
            'email'    => $u->email,
            'enabled'  => (bool) $u->enabled,
            'roles'    => $u->roles->pluck('name')->values(),
        ]);
        return response()->json(['users' => $users]);
    });

    // PATCH /api/v2/rbac/users/{id}/roles — assign roles to a user
    Route::patch('rbac/users/{id}/roles', function ($id, \Illuminate\Http\Request $req) {
        $req->validate(['roles' => 'required|array', 'roles.*' => 'string|exists:roles,name']);
        $user = \App\Models\User::findOrFail($id);

        // Prevent removing super-admin from the last super-admin user
        $roles = $req->input('roles');
        if (! in_array('super-admin', $roles)) {
            $otherSuperAdmins = \App\Models\User::whereHas('roles', fn ($q) => $q->where('name', 'super-admin'))
                ->where('user_id', '!=', $id)->count();
            $currentlySuper = $user->hasRole('super-admin');
            if ($currentlySuper && $otherSuperAdmins === 0) {
                return response()->json(['message' => 'Kamida 1 ta super-admin bo\'lishi kerak'], 422);
            }
        }

        $user->syncRoles($roles);
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();
        return response()->json(['status' => 'ok', 'roles' => $roles]);
    })->where('id', '[0-9]+');
});
