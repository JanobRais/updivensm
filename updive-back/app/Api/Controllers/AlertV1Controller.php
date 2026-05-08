<?php

namespace App\Api\Controllers;

use App\Http\Requests\V1\StoreAlertRuleRequest;
use App\Models\Alert;
use App\Models\AlertLog;
use App\Models\AlertRule;
use App\Models\AlertTransport;
use App\Models\Device;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use UpdiveNSM\Enum\AlertState;

/**
 * Alert API v1 — Zabbix-parity endpoints.
 * Does NOT modify or extend /api/v0/* routes.
 *
 * Zabbix gaps addressed:
 *  - Bulk acknowledge / unacknowledge
 *  - Alert statistics (by state, severity, top devices, 7-day history)
 *  - Full alert detail with history
 *  - Alert rules CRUD + enable/disable toggle
 *  - Alert log with date-range and pagination
 *  - Transport CRUD
 */
class AlertV1Controller extends Controller
{
    // ──────────────────────────────────────────────────────────────────────────
    // ALERTS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/v1/alerts
     *
     * Query params:
     *   state      active|acknowledged|clear|all  (default: active)
     *              comma-separated for multiple: active,acknowledged
     *   severity   ok|warning|critical             comma-separated
     *   rule_id    int
     *   device_id  int
     *   hostname   string
     *   order      timestamp|state|device_id|rule_id  (default: timestamp)
     *   dir        asc|desc                        (default: desc)
     *   per_page   int 1-500                       (default: 50)
     *   page       int                             (default: 1)
     */
    public function index(Request $request): JsonResponse
    {
        $q = Alert::with([
            'device:device_id,hostname,sysName,status',
            'rule:id,name,severity,disabled,notes',
        ])->select('alerts.*');

        // state filter
        $state = $request->query('state', 'active');
        if ($state !== 'all') {
            $map = ['active' => AlertState::ACTIVE, 'acknowledged' => AlertState::ACKNOWLEDGED, 'clear' => AlertState::CLEAR];
            $states = array_filter(array_map(fn ($s) => $map[trim($s)] ?? null, explode(',', $state)));
            if ($states) {
                $q->whereIn('alerts.state', array_values($states));
            }
        }

        // severity filter (needs join)
        if ($severity = $request->query('severity')) {
            $severities = array_map('trim', explode(',', $severity));
            $q->join('alert_rules as ar_sev', 'alerts.rule_id', '=', 'ar_sev.id')
              ->whereIn('ar_sev.severity', $severities);
        }

        if ($ruleId = $request->query('rule_id')) {
            $q->where('alerts.rule_id', (int) $ruleId);
        }

        if ($deviceId = $request->query('device_id')) {
            $q->where('alerts.device_id', (int) $deviceId);
        } elseif ($hostname = $request->query('hostname')) {
            $device = Device::where('hostname', $hostname)->orWhere('ip', $hostname)->first();
            $q->where('alerts.device_id', $device ? $device->device_id : -1);
        }

        $allowed = ['timestamp', 'state', 'device_id', 'rule_id'];
        $order = in_array($request->query('order'), $allowed) ? $request->query('order') : 'timestamp';
        $dir = $request->query('dir') === 'asc' ? 'asc' : 'desc';
        $q->orderBy("alerts.{$order}", $dir);

        $perPage = min(max((int) $request->query('per_page', 50), 1), 500);
        $paged = $q->paginate($perPage);

        return response()->json([
            'status'    => 'ok',
            'alerts'    => $paged->items(),
            'total'     => $paged->total(),
            'page'      => $paged->currentPage(),
            'per_page'  => $paged->perPage(),
            'last_page' => $paged->lastPage(),
        ]);
    }

    /**
     * GET /api/v1/alerts/stats
     *
     * Returns:
     *   by_state      { active, acknowledged, clear }
     *   by_severity   { ok, warning, critical }  — active alerts only
     *   top_devices   [ { hostname, sysName, count } ]  top 10
     *   history_7d    [ { day, count } ]  alert log entries per day
     */
    public function stats(): JsonResponse
    {
        $byState = Alert::selectRaw('state, count(*) as cnt')
            ->groupBy('state')
            ->get()
            ->mapWithKeys(fn ($r) => [
                match ((int) $r->state) {
                    AlertState::ACTIVE       => 'active',
                    AlertState::ACKNOWLEDGED => 'acknowledged',
                    AlertState::CLEAR        => 'clear',
                    default                  => "state_{$r->state}",
                } => (int) $r->cnt,
            ]);

        $bySeverity = Alert::join('alert_rules', 'alerts.rule_id', '=', 'alert_rules.id')
            ->where('alerts.state', AlertState::ACTIVE)
            ->selectRaw('alert_rules.severity, count(*) as cnt')
            ->groupBy('alert_rules.severity')
            ->get()
            ->mapWithKeys(fn ($r) => [$r->severity => (int) $r->cnt]);

        $topDevices = Alert::where('alerts.state', AlertState::ACTIVE)
            ->join('devices', 'alerts.device_id', '=', 'devices.device_id')
            ->selectRaw('devices.hostname, devices.sysName, count(*) as cnt')
            ->groupBy('devices.device_id', 'devices.hostname', 'devices.sysName')
            ->orderByDesc('cnt')
            ->limit(10)
            ->get();

        $history7d = AlertLog::selectRaw('DATE(time_logged) as day, count(*) as cnt')
            ->where('time_logged', '>=', now()->subDays(7))
            ->groupByRaw('DATE(time_logged)')
            ->orderBy('day')
            ->get();

        return response()->json([
            'status'     => 'ok',
            'by_state'   => $byState,
            'by_severity'=> $bySeverity,
            'top_devices'=> $topDevices,
            'history_7d' => $history7d,
        ]);
    }

    /**
     * GET /api/v1/alerts/{id}
     *
     * Full alert detail + last 20 log entries for that device/rule pair.
     */
    public function show(int $id): JsonResponse
    {
        $alert = Alert::with(['device', 'rule.alertOperation'])->findOrFail($id);

        $history = AlertLog::where('device_id', $alert->device_id)
            ->where('rule_id', $alert->rule_id)
            ->orderByDesc('time_logged')
            ->limit(20)
            ->get(['id', 'state', 'details', 'time_logged']);

        return response()->json(['status' => 'ok', 'alert' => $alert, 'history' => $history]);
    }

    /**
     * PUT /api/v1/alerts/{id}/ack
     *
     * Body: { note?: string, until_clear?: bool }
     */
    public function ack(Request $request, int $id): JsonResponse
    {
        $alert = Alert::findOrFail($id);
        $user  = Auth::user()?->username ?? 'api';
        $ts    = now()->toDateTimeString();
        $note  = $request->input('note', '');

        $alert->state = AlertState::ACKNOWLEDGED;
        $alert->note  = "[{$ts}] {$user}: {$note}";
        $info = $alert->info ?? [];
        $info['until_clear'] = (bool) $request->input('until_clear', false);
        $alert->info = $info;
        $alert->save();

        return response()->json(['status' => 'ok', 'message' => 'Alert acknowledged']);
    }

    /**
     * PUT /api/v1/alerts/{id}/unack
     *
     * Body: { note?: string }
     */
    public function unack(Request $request, int $id): JsonResponse
    {
        $alert = Alert::findOrFail($id);
        $user  = Auth::user()?->username ?? 'api';
        $ts    = now()->toDateTimeString();
        $note  = $request->input('note', '');

        $alert->state = AlertState::ACTIVE;
        $existing     = $alert->note ? $alert->note . "\n" : '';
        $alert->note  = $existing . "[{$ts}] {$user} unack: {$note}";
        $alert->save();

        return response()->json(['status' => 'ok', 'message' => 'Alert unacknowledged']);
    }

    /**
     * POST /api/v1/alerts/bulk
     *
     * Body: { ids: int[], action: "ack"|"unack", note?: string, until_clear?: bool }
     *
     * Zabbix parity: event.acknowledge supports multiple eventids in one call.
     */
    public function bulk(Request $request): JsonResponse
    {
        $ids    = $request->input('ids', []);
        $action = $request->input('action');

        if (empty($ids) || ! in_array($action, ['ack', 'unack'])) {
            return response()->json([
                'status'  => 'error',
                'message' => 'ids[] and action (ack|unack) are required',
            ], 422);
        }

        $user      = Auth::user()?->username ?? 'api';
        $ts        = now()->toDateTimeString();
        $note      = $request->input('note', '');
        $untilClear= (bool) $request->input('until_clear', false);

        $affected = 0;
        /** @var Alert $alert */
        foreach (Alert::whereIn('id', $ids)->get() as $alert) {
            if ($action === 'ack') {
                $alert->state = AlertState::ACKNOWLEDGED;
                $alert->note  = "[{$ts}] {$user}: {$note}";
                $info = $alert->info ?? [];
                $info['until_clear'] = $untilClear;
                $alert->info = $info;
            } else {
                $alert->state = AlertState::ACTIVE;
                $existing     = $alert->note ? $alert->note . "\n" : '';
                $alert->note  = $existing . "[{$ts}] {$user} unack: {$note}";
            }
            $alert->save();
            $affected++;
        }

        return response()->json(['status' => 'ok', 'affected' => $affected]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ALERT RULES
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/v1/alert-rules
     *
     * Query params: search, severity, disabled (0|1), per_page, page
     */
    public function listRules(Request $request): JsonResponse
    {
        $q = AlertRule::with(['devices:device_id,hostname', 'groups:id,name', 'locations:id,location']);

        if ($search = $request->query('search')) {
            $q->where('name', 'like', "%{$search}%");
        }
        if ($severity = $request->query('severity')) {
            $q->whereIn('severity', array_map('trim', explode(',', $severity)));
        }
        if ($request->has('disabled')) {
            $q->where('disabled', (bool) $request->query('disabled'));
        }

        $perPage = min(max((int) $request->query('per_page', 50), 1), 500);
        $paged   = $q->orderBy('name')->paginate($perPage);

        return response()->json([
            'status'    => 'ok',
            'rules'     => $paged->items(),
            'total'     => $paged->total(),
            'page'      => $paged->currentPage(),
            'last_page' => $paged->lastPage(),
        ]);
    }

    /**
     * GET /api/v1/alert-rules/{id}
     */
    public function showRule(int $id): JsonResponse
    {
        $rule = AlertRule::with([
            'devices:device_id,hostname,sysName',
            'groups:id,name',
            'locations:id,location',
            'alertOperation.segments',
            'alerts' => fn ($q) => $q->where('state', '!=', AlertState::CLEAR)->limit(20),
        ])->findOrFail($id);

        return response()->json(['status' => 'ok', 'rule' => $rule]);
    }

    /**
     * POST /api/v1/alert-rules
     *
     * Body: { name, severity, builder?, query?, disabled?, notes?, proc?, invert_map? }
     */
    /**
     * POST /api/v1/alert-rules
     *
     * Accepts frontend field names and maps them to DB columns:
     *   rule_name        → name
     *   start_disabled   → disabled
     *   invert_device_map→ invert_map
     *   severity "info"  → "ok"
     *
     * The `query` field is sanitised to block destructive SQL keywords
     * (DROP, DELETE, UPDATE, INSERT, etc.) before saving.
     *
     * Success 201:
     *   { "status": "ok", "rule": { id, name, severity, query, disabled,
     *     invert_map, notes, alert_operation_id, created_meta } }
     *
     * Error 422:  { "message": "...", "errors": { field: ["..."] } }
     * Error 400:  { "status": "error", "message": "Unsafe query detected." }
     */
    public function createRule(StoreAlertRuleRequest $request): JsonResponse
    {
        $v = $request->validated();

        // ── 1. Sanitise query ──────────────────────────────────────────────────
        $query = trim($v['query']);
        $unsafe = $this->detectUnsafeQuery($query);
        if ($unsafe) {
            return response()->json([
                'status'  => 'error',
                'message' => "Unsafe SQL keyword detected: \"{$unsafe}\". "
                           . 'Only SELECT-style conditions (WHERE clauses) are allowed.',
            ], 400);
        }

        // ── 2. Map frontend field names → DB column names ──────────────────────
        $severity = $v['severity'] === 'info' ? 'ok' : $v['severity'];

        $payload = [
            'name'               => trim($v['rule_name']),
            'severity'           => $severity,
            'query'              => $query,
            'notes'              => $v['notes'] ?? null,
            'disabled'           => $v['start_disabled']    ?? false,
            'invert_map'         => $v['invert_device_map'] ?? false,
            'alert_operation_id' => $v['alert_operation_id'] ?? null,
            'confirm_count'      => max(1, (int) ($v['confirm_count'] ?? 1)),
            'delay_min'          => max(0, (int) ($v['delay_min'] ?? 0)),
            // `extra` stores per-rule notification meta; default matches LibreNMS convention
            'extra'              => ['mute' => false, 'count' => -1,
                                     'delay' => null, 'interval' => null,
                                     'recovery' => true],
        ];

        // ── 3. Persist ─────────────────────────────────────────────────────────
        $rule = AlertRule::create($payload);

        // ── 4. Return full detail ──────────────────────────────────────────────
        $rule->load(['alertOperation:id,name']);

        return response()->json([
            'status' => 'ok',
            'rule'   => [
                'id'                 => $rule->id,
                'name'               => $rule->name,
                'severity'           => $rule->severity,
                'query'              => $rule->query,
                'notes'              => $rule->notes,
                'disabled'           => (bool) $rule->disabled,
                'invert_map'         => (bool) $rule->invert_map,
                'alert_operation_id' => $rule->alert_operation_id,
                'operation'          => $rule->alertOperation
                                            ? ['id' => $rule->alertOperation->id,
                                               'name' => $rule->alertOperation->name]
                                            : null,
                'created_meta'       => [
                    'fires_all_time' => 0,
                    'active_alerts'  => 0,
                    'status'         => $rule->disabled ? 'disabled' : 'enabled',
                ],
            ],
        ], 201);
    }

    /**
     * Returns the first forbidden keyword found in the query string,
     * or null if the query is safe.
     *
     * Allowed: any WHERE-clause condition (comparisons, LIKE, IN, IS NULL,
     *   subselects with SELECT, BETWEEN, CASE, string/numeric literals).
     * Blocked: DML/DDL that can mutate or destroy data.
     */
    private function detectUnsafeQuery(string $query): ?string
    {
        // Word-boundary regex so "dropdown" doesn't trip on "drop"
        $forbidden = [
            'DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE',
            'CREATE', 'RENAME', 'REPLACE', 'EXEC', 'EXECUTE', 'CALL',
            'GRANT', 'REVOKE', 'LOAD_FILE', 'INTO OUTFILE', 'INTO DUMPFILE',
        ];

        $upper = strtoupper($query);

        foreach ($forbidden as $kw) {
            // Match as a whole word (not part of a longer identifier)
            if (preg_match('/\b' . preg_quote($kw, '/') . '\b/', $upper)) {
                return $kw;
            }
        }

        // Also block comment sequences and stacked-query separators
        if (str_contains($query, '--') || str_contains($query, '/*') || str_contains($query, ';')) {
            return str_contains($query, '--') ? '--'
                 : (str_contains($query, '/*') ? '/*' : ';');
        }

        return null;
    }

    /**
     * PUT /api/v1/alert-rules/{id}
     */
    public function updateRule(Request $request, int $id): JsonResponse
    {
        $rule = AlertRule::findOrFail($id);

        $data = $request->validate([
            'name'               => "string|unique:alert_rules,name,{$id}",
            'severity'           => 'in:ok,warning,critical',
            'builder'            => 'nullable|array',
            'query'              => 'nullable|string',
            'disabled'           => 'boolean',
            'notes'              => 'nullable|string',
            'proc'               => 'nullable|string|max:80',
            'invert_map'         => 'boolean',
            'alert_operation_id' => 'nullable|integer|exists:alert_operations,id',
        ]);

        $rule->update($data);

        return response()->json(['status' => 'ok', 'rule' => $rule]);
    }

    /**
     * DELETE /api/v1/alert-rules/{id}
     */
    public function deleteRule(int $id): JsonResponse
    {
        AlertRule::findOrFail($id)->delete();

        return response()->json(['status' => 'ok', 'message' => "Rule {$id} deleted"]);
    }

    /**
     * PATCH /api/v1/alert-rules/{id}/toggle
     *
     * Flips disabled flag. Zabbix: trigger.update({ status: 0|1 })
     */
    public function toggleRule(int $id): JsonResponse
    {
        $rule = AlertRule::findOrFail($id);
        $rule->disabled = ! $rule->disabled;
        $rule->save();

        $state = $rule->disabled ? 'disabled' : 'enabled';

        return response()->json(['status' => 'ok', 'message' => "Rule {$state}", 'disabled' => (bool) $rule->disabled]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ALERT LOG
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/v1/alert-log
     *
     * Query params: device_id, hostname, rule_id, state, from (datetime), to (datetime), per_page, page
     *
     * Zabbix parity: history.get / event.get with time_from / time_till
     */
    public function alertLog(Request $request): JsonResponse
    {
        $q = AlertLog::with([
            'device:device_id,hostname,sysName',
            'rule:id,name,severity',
        ])->orderByDesc('time_logged');

        if ($deviceId = $request->query('device_id')) {
            $q->where('alert_log.device_id', (int) $deviceId);
        } elseif ($hostname = $request->query('hostname')) {
            $device = Device::where('hostname', $hostname)->orWhere('ip', $hostname)->first();
            $q->where('alert_log.device_id', $device ? $device->device_id : -1);
        }

        if ($ruleId = $request->query('rule_id')) {
            $q->where('alert_log.rule_id', (int) $ruleId);
        }
        if ($state = $request->query('state')) {
            $q->where('alert_log.state', (int) $state);
        }
        if ($from = $request->query('from')) {
            $q->where('time_logged', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('time_logged', '<=', $to);
        }

        $perPage = min(max((int) $request->query('per_page', 50), 1), 500);
        $paged   = $q->paginate($perPage);

        return response()->json([
            'status'    => 'ok',
            'logs'      => $paged->items(),
            'total'     => $paged->total(),
            'page'      => $paged->currentPage(),
            'last_page' => $paged->lastPage(),
        ]);
    }

    /**
     * GET /api/v1/alert-log/{id}
     */
    public function showLog(int $id): JsonResponse
    {
        $log = AlertLog::with([
            'device:device_id,hostname,sysName',
            'rule:id,name,severity',
        ])->findOrFail($id);

        return response()->json(['status' => 'ok', 'log' => $log]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TRANSPORTS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/v1/alert-transports
     *
     * Zabbix parity: mediatype.get
     */
    public function listTransports(): JsonResponse
    {
        $transports = AlertTransport::all([
            'transport_id', 'transport_name', 'transport_type', 'is_default',
        ]);

        return response()->json(['status' => 'ok', 'transports' => $transports]);
    }

    /**
     * GET /api/v1/alert-transports/{id}
     */
    public function showTransport(int $id): JsonResponse
    {
        $transport = AlertTransport::findOrFail($id);

        return response()->json(['status' => 'ok', 'transport' => $transport]);
    }

    /**
     * POST /api/v1/alert-transports
     *
     * Body: { transport_name, transport_type, is_default?, transport_config? }
     */
    public function createTransport(Request $request): JsonResponse
    {
        $request->validate([
            'transport_name'   => 'required|string|max:30',
            'transport_type'   => 'required|string|max:20',
            'is_default'       => 'boolean',
            'transport_config' => 'nullable|array',
        ]);

        $transport = new AlertTransport;
        $transport->transport_name   = $request->input('transport_name');
        $transport->transport_type   = $request->input('transport_type');
        $transport->is_default       = (bool) $request->input('is_default', false);
        $transport->transport_config = $request->input('transport_config', []);
        $transport->save();

        return response()->json(['status' => 'ok', 'transport' => $transport], 201);
    }

    /**
     * PUT /api/v1/alert-transports/{id}
     *
     * Body: { transport_name?, is_default?, transport_config? }
     */
    public function updateTransport(Request $request, int $id): JsonResponse
    {
        $transport = AlertTransport::findOrFail($id);

        $request->validate([
            'transport_name'   => 'string|max:30',
            'is_default'       => 'boolean',
            'transport_config' => 'nullable|array',
        ]);

        if ($request->has('transport_name')) {
            $transport->transport_name = $request->input('transport_name');
        }
        if ($request->has('is_default')) {
            $transport->is_default = (bool) $request->input('is_default');
        }
        if ($request->has('transport_config')) {
            $transport->transport_config = $request->input('transport_config');
        }
        $transport->save();

        return response()->json(['status' => 'ok', 'transport' => $transport]);
    }

    /**
     * DELETE /api/v1/alert-transports/{id}
     */
    public function deleteTransport(int $id): JsonResponse
    {
        AlertTransport::findOrFail($id)->delete();

        return response()->json(['status' => 'ok', 'message' => "Transport {$id} deleted"]);
    }
}
