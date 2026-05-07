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

        // GET /api/v0/metrics?device_id=1&metric_type=cpu&object_id=1&from=2026-04-01&to=2026-05-04&resolution=auto
        Route::get('metrics', function (\Illuminate\Http\Request $req) {
            $from       = $req->input('from', now()->subHours(6)->toDateTimeString());
            $to         = $req->input('to',   now()->toDateTimeString());
            $resolution = $req->input('resolution', 'auto');
            $limit      = min((int) $req->input('limit', 2000), 10000);

            $q = \DB::table('updive_metrics')
                ->whereBetween('collected_at', [$from, $to]);

            if ($req->has('device_id'))   $q->where('device_id',   $req->input('device_id'));
            if ($req->has('metric_type')) $q->where('metric_type', $req->input('metric_type'));
            if ($req->has('object_id'))   $q->where('object_id',   $req->input('object_id'));

            // auto resolution: aggregate if range > 24h
            $diffHours = (strtotime($to) - strtotime($from)) / 3600;

            if ($resolution === 'auto') {
                if ($diffHours > 24 * 7)       $resolution = 'day';
                elseif ($diffHours > 24)        $resolution = 'hour';
                else                            $resolution = 'raw';
            }

            // Build WHERE bindings for raw SQL (avoids ONLY_FULL_GROUP_BY alias conflict)
            $bindings = [$from, $to];
            $wheres   = 'WHERE m.collected_at BETWEEN ? AND ?';
            if ($req->has('device_id'))   { $wheres .= ' AND m.device_id = ?';   $bindings[] = $req->input('device_id'); }
            if ($req->has('metric_type')) { $wheres .= ' AND m.metric_type = ?'; $bindings[] = $req->input('metric_type'); }
            if ($req->has('object_id'))   { $wheres .= ' AND m.object_id = ?';   $bindings[] = $req->input('object_id'); }

            if ($resolution === 'day') {
                $bindings[] = $limit;
                $rows = collect(\DB::select("
                    SELECT m.device_id, m.metric_type, m.object_id, m.object_name, m.unit,
                           DATE_FORMAT(m.collected_at, '%Y-%m-%d 00:00:00') AS collected_at,
                           AVG(m.value) AS value, MIN(m.value) AS value_min, MAX(m.value) AS value_max
                    FROM updive_metrics m
                    {$wheres}
                    GROUP BY m.device_id, m.metric_type, m.object_id, m.object_name, m.unit,
                             DATE_FORMAT(m.collected_at, '%Y-%m-%d 00:00:00')
                    ORDER BY DATE_FORMAT(m.collected_at, '%Y-%m-%d 00:00:00')
                    LIMIT ?
                ", $bindings));
            } elseif ($resolution === 'hour') {
                $bindings[] = $limit;
                $rows = collect(\DB::select("
                    SELECT m.device_id, m.metric_type, m.object_id, m.object_name, m.unit,
                           DATE_FORMAT(m.collected_at, '%Y-%m-%d %H:00:00') AS collected_at,
                           AVG(m.value) AS value, MIN(m.value) AS value_min, MAX(m.value) AS value_max
                    FROM updive_metrics m
                    {$wheres}
                    GROUP BY m.device_id, m.metric_type, m.object_id, m.object_name, m.unit,
                             DATE_FORMAT(m.collected_at, '%Y-%m-%d %H:00:00')
                    ORDER BY DATE_FORMAT(m.collected_at, '%Y-%m-%d %H:00:00')
                    LIMIT ?
                ", $bindings));
            } else {
                $rows = $q->select(
                    'device_id', 'metric_type', 'object_id', 'object_name', 'unit',
                    'collected_at', 'value',
                    \DB::raw('value AS value_min'),
                    \DB::raw('value AS value_max')
                )->orderBy('collected_at')->limit($limit)->get();
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
            return response()->json([
                'status'    => 'ok',
                'stats'     => $stats,
                'devices'   => $devices,
                'db_tables' => $db_tables,
            ]);
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
});
