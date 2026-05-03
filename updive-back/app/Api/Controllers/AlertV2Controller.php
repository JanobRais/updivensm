<?php

namespace App\Api\Controllers;

use App\Http\Requests\V2\AckAlertRequest;
use App\Http\Requests\V2\BulkAlertRequest;
use App\Http\Requests\V2\MuteAlertRequest;
use App\Http\Requests\V2\StoreAlertRuleRequest;
use App\Http\Requests\V2\StoreTransportRequest;
use App\Http\Requests\V2\UpdateAlertRuleRequest;
use App\Http\Requests\V2\UpdateTransportRequest;
use App\Models\Alert;
use App\Models\AlertLog;
use App\Models\AlertRule;
use App\Models\AlertTransport;
use App\Models\BgpPeer;
use App\Models\Device;
use App\Models\Port;
use App\Models\Sensor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use UpdiveNSM\Enum\AlertState;

/**
 * Alert API v2 — Production-grade endpoints for 1000+ device environments.
 *
 * Addresses v0 API weaknesses:
 *   Cursor pagination  — efficient for large datasets (no OFFSET)
 *   Rich component     — port / sensor / BGP / CPU / memory / storage / service
 *   Graph URLs         — per-component, ready for frontend embedding
 *   Mute / unmute      — suppress transports without changing alert state
 *   Bulk operations    — up to 500 alerts in one call
 *   Multi-dim stats    — MTTR, storm detection, histogram, top devices/rules
 *   Grouped view       — device / rule / severity
 *   Alertmanager style — labels, annotations stored in info JSON
 *   Full CRUD          — rules + transports
 *   Form Requests      — validated inputs, clear error messages
 *
 * Does NOT touch /api/v0/* or /api/v1/* in any way.
 */
class AlertV2Controller extends Controller
{
    // ─── Internal constants ───────────────────────────────────────────────────

    private const STATE_LABELS = [
        AlertState::CLEAR        => 'clear',
        AlertState::ACTIVE       => 'active',
        AlertState::ACKNOWLEDGED => 'acknowledged',
        AlertState::WORSE        => 'worse',
        AlertState::BETTER       => 'better',
        AlertState::CHANGED      => 'changed',
    ];

    private const STATE_MAP = [
        'clear'        => AlertState::CLEAR,
        'active'       => AlertState::ACTIVE,
        'acknowledged' => AlertState::ACKNOWLEDGED,
        'worse'        => AlertState::WORSE,
        'better'       => AlertState::BETTER,
        'changed'      => AlertState::CHANGED,
    ];

    // ═════════════════════════════════════════════════════════════════════════
    // ALERTS — LISTING
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @OA\Get(path="/api/v2/alerts", summary="Cursor-paginated alert list with rich filters",
     *   tags={"Alerts v2"},
     *   @OA\Parameter(name="state",     in="query", description="active|acknowledged|worse|better|changed|clear|all  (comma-separated for multiple)"),
     *   @OA\Parameter(name="severity",  in="query", description="ok|warning|critical  (comma-separated)"),
     *   @OA\Parameter(name="device_id", in="query", schema=@OA\Schema(type="integer")),
     *   @OA\Parameter(name="hostname",  in="query", description="Exact or partial device hostname"),
     *   @OA\Parameter(name="rule_id",   in="query", schema=@OA\Schema(type="integer")),
     *   @OA\Parameter(name="search",    in="query", description="Full-text across hostname, sysName, rule name, note"),
     *   @OA\Parameter(name="muted",     in="query", schema=@OA\Schema(type="integer", enum={0,1})),
     *   @OA\Parameter(name="after",     in="query", description="ISO datetime lower bound on alert timestamp"),
     *   @OA\Parameter(name="before",    in="query", description="ISO datetime upper bound on alert timestamp"),
     *   @OA\Parameter(name="limit",     in="query", schema=@OA\Schema(type="integer", minimum=1, maximum=500, default=50)),
     *   @OA\Parameter(name="cursor",    in="query", description="Opaque cursor token from meta.next_cursor")
     * )
     *
     * Example response:
     * {
     *   "status": "ok",
     *   "data": [
     *     {
     *       "id": 42, "device_id": 7, "rule_id": 3,
     *       "state": "active", "state_code": 1,
     *       "severity": "critical",
     *       "rule_name": "CPU > 90%",
     *       "hostname": "core-sw-01", "sysName": "CoreSwitch01",
     *       "device_status": 1,
     *       "note": null,
     *       "timestamp": "2026-05-03 08:14:22",
     *       "muted": false, "muted_until": null, "until_clear": false
     *     }
     *   ],
     *   "meta": { "limit": 50, "next_cursor": "eyJpZCI6NDJ9...", "prev_cursor": null, "has_more": true }
     * }
     */
    public function index(Request $request): JsonResponse
    {
        $q = Alert::with([
            'device:device_id,hostname,sysName,status,uptime,type',
            'rule:id,name,severity,disabled,notes,proc',
        ])->orderByDesc('alerts.id');

        $this->applyAlertFilters($q, $request);

        $limit = $this->limit($request);
        $paged = $q->cursorPaginate($limit, ['alerts.*'], 'cursor');

        return response()->json([
            'status' => 'ok',
            'data'   => collect($paged->items())->map(fn ($a) => $this->summarise($a)),
            'meta'   => $this->cursorMeta($paged, $limit),
        ]);
    }

    /**
     * @OA\Get(path="/api/v2/alerts/active",
     *   summary="Shortcut: active + worse + changed alerts only",
     *   tags={"Alerts v2"}
     * )
     */
    public function active(Request $request): JsonResponse
    {
        // Merge state filter so applyAlertFilters picks it up
        $request->merge(['state' => 'active,worse,changed']);

        return $this->index($request);
    }

    /**
     * @OA\Get(path="/api/v2/alerts/grouped",
     *   summary="Alert counts grouped by device, rule, or severity",
     *   tags={"Alerts v2"},
     *   @OA\Parameter(name="by",    in="query", description="device|rule|severity  (default: device)"),
     *   @OA\Parameter(name="state", in="query", description="active|all  (default: active)")
     * )
     *
     * Example (by=device):
     * {
     *   "status": "ok", "grouped_by": "device",
     *   "groups": [
     *     { "device_id":7, "hostname":"core-sw-01", "sysName":"CS01",
     *       "status":1, "total":5, "critical":3, "warning":2, "acknowledged":1, "worse":2 }
     *   ]
     * }
     */
    public function grouped(Request $request): JsonResponse
    {
        $by    = in_array($request->query('by'), ['device', 'rule', 'severity'])
                    ? $request->query('by') : 'device';
        $state = $request->query('state', 'active');

        // Base query with alert_rules join for severity aggregation
        $base = Alert::join('alert_rules as gr', 'alerts.rule_id', '=', 'gr.id');

        if ($state !== 'all') {
            $states = array_filter(
                array_map(fn ($s) => self::STATE_MAP[trim($s)] ?? null, explode(',', $state))
            );
            if ($states) {
                $base->whereIn('alerts.state', array_values($states));
            }
        }

        if ($by === 'rule') {
            $groups = $base
                ->selectRaw('
                    gr.id         AS rule_id,
                    gr.name       AS rule_name,
                    gr.severity,
                    COUNT(*)                               AS total,
                    SUM(alerts.state = ?)                  AS acknowledged,
                    SUM(alerts.state = ?)                  AS active,
                    SUM(alerts.state = ?)                  AS worse
                ', [AlertState::ACKNOWLEDGED, AlertState::ACTIVE, AlertState::WORSE])
                ->groupBy('gr.id', 'gr.name', 'gr.severity')
                ->orderByDesc('total')
                ->limit(200)
                ->get();

        } elseif ($by === 'severity') {
            $groups = $base
                ->selectRaw('
                    gr.severity,
                    COUNT(*)      AS total,
                    SUM(alerts.state = ?) AS acknowledged,
                    SUM(alerts.state = ?) AS active,
                    SUM(alerts.state = ?) AS worse
                ', [AlertState::ACKNOWLEDGED, AlertState::ACTIVE, AlertState::WORSE])
                ->groupBy('gr.severity')
                ->orderByRaw("FIELD(gr.severity, 'critical', 'warning', 'ok')")
                ->get();

        } else {
            // by device (default)
            $groups = $base
                ->join('devices as gd', 'alerts.device_id', '=', 'gd.device_id')
                ->selectRaw('
                    gd.device_id,
                    gd.hostname,
                    gd.sysName,
                    gd.status,
                    COUNT(*)                               AS total,
                    SUM(gr.severity = "critical")          AS critical,
                    SUM(gr.severity = "warning")           AS warning,
                    SUM(alerts.state = ?)                  AS acknowledged,
                    SUM(alerts.state = ?)                  AS worse
                ', [AlertState::ACKNOWLEDGED, AlertState::WORSE])
                ->groupBy('gd.device_id', 'gd.hostname', 'gd.sysName', 'gd.status')
                ->orderByDesc('total')
                ->limit(500)
                ->get();
        }

        return response()->json([
            'status'     => 'ok',
            'grouped_by' => $by,
            'groups'     => $groups,
        ]);
    }

    /**
     * @OA\Get(path="/api/v2/alerts/stats",
     *   summary="Multi-dimensional statistics: states, severities, MTTR, storm detection, histogram",
     *   tags={"Alerts v2"},
     *   @OA\Parameter(name="days", in="query", description="7|14|30|90  (default: 7)")
     * )
     *
     * Example response:
     * {
     *   "status": "ok", "period_days": 7,
     *   "by_state":    { "active":12, "acknowledged":3, "clear":0 },
     *   "by_severity": { "critical":5, "warning":7 },
     *   "top_devices": [ { "device_id":7, "hostname":"core-sw-01", "total":5, "critical":3, "warning":2 } ],
     *   "top_rules":   [ { "id":3, "name":"CPU > 90%", "severity":"critical", "fires":14 } ],
     *   "histogram":   { "2026-04-27": 8, "2026-04-28": 11, ... },
     *   "mttr":        [ { "id":3, "name":"CPU > 90%", "avg_seconds": 1820 } ],
     *   "storms":      [ { "id":3, "name":"CPU > 90%", "hostname":"core-sw-01", "fires":7 } ]
     * }
     */
    public function stats(Request $request): JsonResponse
    {
        $days = in_array((int) $request->query('days'), [7, 14, 30, 90])
                    ? (int) $request->query('days') : 7;

        // ── By state ──────────────────────────────────────────────────────────
        $byState = Alert::selectRaw('state, COUNT(*) AS cnt')
            ->groupBy('state')
            ->get()
            ->mapWithKeys(fn ($r) => [
                self::STATE_LABELS[(int) $r->state] ?? "state_{$r->state}" => (int) $r->cnt,
            ]);

        // ── By severity (active/worse/changed only) ───────────────────────────
        $bySeverity = Alert::join('alert_rules as sr', 'alerts.rule_id', '=', 'sr.id')
            ->whereIn('alerts.state', [AlertState::ACTIVE, AlertState::WORSE, AlertState::CHANGED])
            ->selectRaw('sr.severity, COUNT(*) AS cnt')
            ->groupBy('sr.severity')
            ->get()
            ->mapWithKeys(fn ($r) => [$r->severity => (int) $r->cnt]);

        // ── Top 10 devices by active alert count ──────────────────────────────
        $topDevices = Alert::join('devices as td',      'alerts.device_id', '=', 'td.device_id')
            ->join('alert_rules as tdr', 'alerts.rule_id',   '=', 'tdr.id')
            ->whereIn('alerts.state', [AlertState::ACTIVE, AlertState::WORSE, AlertState::CHANGED])
            ->selectRaw('
                td.device_id, td.hostname, td.sysName,
                COUNT(*)                      AS total,
                SUM(tdr.severity = "critical") AS critical,
                SUM(tdr.severity = "warning")  AS warning
            ')
            ->groupBy('td.device_id', 'td.hostname', 'td.sysName')
            ->orderByDesc('total')
            ->limit(10)
            ->get();

        // ── Top 10 rules by fire count (alert_log, last N days) ───────────────
        $topRules = AlertLog::join('alert_rules as tr', 'alert_log.rule_id', '=', 'tr.id')
            ->where('alert_log.time_logged', '>=', now()->subDays($days))
            ->selectRaw('tr.id, tr.name, tr.severity, COUNT(*) AS fires')
            ->groupBy('tr.id', 'tr.name', 'tr.severity')
            ->orderByDesc('fires')
            ->limit(10)
            ->get();

        // ── Daily histogram of alert_log entries ──────────────────────────────
        $histogram = AlertLog::selectRaw('DATE(time_logged) AS day, COUNT(*) AS cnt')
            ->where('time_logged', '>=', now()->subDays($days))
            ->groupByRaw('DATE(time_logged)')
            ->orderBy('day')
            ->get()
            ->mapWithKeys(fn ($r) => [$r->day => (int) $r->cnt]);

        // ── MTTR per rule (avg seconds from ACTIVE→CLEAR pairs) ───────────────
        // Approximated from alert_log: avg(CLEAR time) - avg(ACTIVE time) within period
        $mttr = AlertLog::join('alert_rules as mr', 'alert_log.rule_id', '=', 'mr.id')
            ->where('alert_log.time_logged', '>=', now()->subDays($days))
            ->selectRaw('
                mr.id, mr.name,
                ROUND(
                    AVG(CASE WHEN alert_log.state = ? THEN UNIX_TIMESTAMP(alert_log.time_logged) ELSE NULL END) -
                    AVG(CASE WHEN alert_log.state = ? THEN UNIX_TIMESTAMP(alert_log.time_logged) ELSE NULL END)
                ) AS avg_seconds
            ', [AlertState::CLEAR, AlertState::ACTIVE])
            ->groupBy('mr.id', 'mr.name')
            ->havingRaw('avg_seconds > 0')
            ->orderByDesc('avg_seconds')
            ->limit(10)
            ->get();

        // ── Alert storm: rules with ≥5 fires in last 1 hour (false-positive risk) ──
        $storms = AlertLog::join('alert_rules as st',  'alert_log.rule_id',   '=', 'st.id')
            ->join('devices as std', 'alert_log.device_id', '=', 'std.device_id')
            ->where('alert_log.time_logged', '>=', now()->subHour())
            ->selectRaw('st.id, st.name, std.hostname, COUNT(*) AS fires')
            ->groupBy('st.id', 'st.name', 'std.hostname')
            ->having('fires', '>=', 5)
            ->orderByDesc('fires')
            ->get();

        return response()->json([
            'status'      => 'ok',
            'period_days' => $days,
            'by_state'    => $byState,
            'by_severity' => $bySeverity,
            'top_devices' => $topDevices,
            'top_rules'   => $topRules,
            'histogram'   => $histogram,
            'mttr'        => $mttr,
            'storms'      => $storms,
        ]);
    }

    /**
     * @OA\Get(path="/api/v2/alerts/{id}",
     *   summary="Full alert detail: component, graph URLs, severity trend, related alerts, history",
     *   tags={"Alerts v2"},
     *
     * Example response:
     * {
     *   "status": "ok",
     *   "alert": {
     *     "id": 42, "state": "active", "severity": "critical",
     *     "hostname": "core-sw-01", "rule_name": "CPU > 90%",
     *     "muted": false, "until_clear": false,
     *     "component": {
     *       "type": "processor", "id": 5, "data": null,
     *       "context": { "processor_id": 5, "processor_usage": 94 }
     *     },
     *     "graphs": [
     *       { "label": "CPU",         "url": "/graph?type=device_processor&id=7&from=-6h&..." },
     *       { "label": "Uptime",      "url": "/graph?type=device_uptime&id=7&from=-6h&..." },
     *       { "label": "Availability","url": "/graph?type=device_availability&id=7&from=-6h&..." }
     *     ],
     *     "trend": [
     *       { "state": "active", "time": "2026-05-03 08:14:22" },
     *       { "state": "clear",  "time": "2026-05-02 22:10:00" }
     *     ],
     *     "history": [ { "id":210, "rule_id":3, "state":{...}, "time_logged":"2026-05-03 08:14:22" } ],
     *     "related": [
     *       { "id":43, "hostname":"core-sw-01", "rule_name":"Memory > 85%",
     *         "state":"active", "severity":"warning", "relation":"same_device" }
     *     ],
     *     "labels":      { "env": "production", "team": "network" },
     *     "annotations": { "summary": "CPU at 94% for 15 min", "runbook": "https://..." }
     *   }
     * }
     */
    public function show(int $id): JsonResponse
    {
        $alert = Alert::with([
            'device',
            'rule.alertOperation.segments.transportSingles',
            'rule.alertOperation.segments.transportGroups',
        ])->findOrFail($id);

        $component = $this->detectComponent($alert);
        $graphs    = $this->buildGraphUrls($alert, $component);
        $trend     = $this->severityTrend($alert);
        $related   = $this->relatedAlerts($alert);

        $history = AlertLog::with(['rule:id,name,severity'])
            ->where('device_id', $alert->device_id)
            ->where('rule_id',   $alert->rule_id)
            ->orderByDesc('time_logged')
            ->limit(25)
            ->get(['id', 'rule_id', 'state', 'time_logged']);

        $info = $alert->info ?? [];

        return response()->json([
            'status' => 'ok',
            'alert'  => array_merge($this->summarise($alert), [
                'device'      => $alert->device,
                'rule'        => $alert->rule,
                'component'   => $component,
                'graphs'      => $graphs,
                'trend'       => $trend,
                'history'     => $history,
                'related'     => $related,
                'labels'      => $info['labels']      ?? (object) [],
                'annotations' => $info['annotations'] ?? (object) [],
            ]),
        ]);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ALERTS — SINGLE ACTIONS
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @OA\Post(path="/api/v2/alerts/{id}/ack",
     *   summary="Acknowledge alert — state → acknowledged, optionally suppress until clear",
     *   tags={"Alerts v2"},
     *   @OA\RequestBody(required=false, @OA\JsonContent(
     *     @OA\Property(property="note",        type="string",  example="Investigating now"),
     *     @OA\Property(property="until_clear", type="boolean", example=true)
     *   ))
     * )
     */
    public function ack(AckAlertRequest $request, int $id): JsonResponse
    {
        $this->applyAck(
            Alert::findOrFail($id),
            (string) $request->input('note', ''),
            (bool)   $request->input('until_clear', false)
        );

        return response()->json(['status' => 'ok', 'message' => 'Alert acknowledged', 'state' => 'acknowledged']);
    }

    /**
     * @OA\Post(path="/api/v2/alerts/{id}/unack",
     *   summary="Unacknowledge alert — state → active",
     *   tags={"Alerts v2"}
     * )
     */
    public function unack(Request $request, int $id): JsonResponse
    {
        $alert = Alert::findOrFail($id);
        $ts    = now()->toDateTimeString();
        $user  = $this->currentUser();
        $note  = (string) $request->input('note', '');

        $alert->state = AlertState::ACTIVE;
        $alert->note  = ($alert->note ? $alert->note . "\n" : '') . "[{$ts}] {$user} unack: {$note}";
        $alert->save();

        return response()->json(['status' => 'ok', 'message' => 'Alert unacknowledged', 'state' => 'active']);
    }

    /**
     * @OA\Post(path="/api/v2/alerts/{id}/mute",
     *   summary="Mute alert — suppresses transport notifications, state unchanged",
     *   tags={"Alerts v2"},
     *   @OA\RequestBody(required=false, @OA\JsonContent(
     *     @OA\Property(property="note",        type="string",           example="Planned maintenance"),
     *     @OA\Property(property="muted_until", type="string", format="date-time", example="2026-05-03T18:00:00")
     *   ))
     * )
     */
    public function mute(MuteAlertRequest $request, int $id): JsonResponse
    {
        $this->applyMute(
            Alert::findOrFail($id),
            true,
            (string) $request->input('note', ''),
            $request->input('muted_until')
        );

        return response()->json(['status' => 'ok', 'message' => 'Alert muted', 'muted' => true]);
    }

    /**
     * @OA\Post(path="/api/v2/alerts/{id}/unmute",
     *   summary="Unmute alert — re-enable transport notifications",
     *   tags={"Alerts v2"}
     * )
     */
    public function unmute(Request $request, int $id): JsonResponse
    {
        $this->applyMute(
            Alert::findOrFail($id),
            false,
            (string) $request->input('note', ''),
            null
        );

        return response()->json(['status' => 'ok', 'message' => 'Alert unmuted', 'muted' => false]);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ALERTS — BULK OPERATIONS  (Zabbix: event.acknowledge batch)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @OA\Post(path="/api/v2/alerts/bulk/ack",
     *   summary="Bulk acknowledge up to 500 alerts",
     *   tags={"Alerts v2"},
     *   @OA\RequestBody(required=true, @OA\JsonContent(
     *     @OA\Property(property="ids",         type="array", @OA\Items(type="integer"), example={42,43,44}),
     *     @OA\Property(property="note",        type="string"),
     *     @OA\Property(property="until_clear", type="boolean")
     *   ))
     * )
     */
    public function bulkAck(BulkAlertRequest $request): JsonResponse
    {
        $note  = (string) $request->input('note', '');
        $until = (bool)   $request->input('until_clear', false);
        $count = 0;

        foreach (Alert::whereIn('id', $request->input('ids'))->get() as $alert) {
            $this->applyAck($alert, $note, $until);
            $count++;
        }

        return response()->json(['status' => 'ok', 'affected' => $count]);
    }

    /**
     * @OA\Post(path="/api/v2/alerts/bulk/unack",
     *   summary="Bulk unacknowledge up to 500 alerts",
     *   tags={"Alerts v2"}
     * )
     */
    public function bulkUnack(BulkAlertRequest $request): JsonResponse
    {
        $user  = $this->currentUser();
        $ts    = now()->toDateTimeString();
        $note  = (string) $request->input('note', '');
        $count = 0;

        foreach (Alert::whereIn('id', $request->input('ids'))->get() as $alert) {
            $alert->state = AlertState::ACTIVE;
            $alert->note  = ($alert->note ? $alert->note . "\n" : '') . "[{$ts}] {$user} bulk-unack: {$note}";
            $alert->save();
            $count++;
        }

        return response()->json(['status' => 'ok', 'affected' => $count]);
    }

    /**
     * @OA\Post(path="/api/v2/alerts/bulk/mute",
     *   summary="Bulk mute up to 500 alerts",
     *   tags={"Alerts v2"},
     *   @OA\RequestBody(required=true, @OA\JsonContent(
     *     @OA\Property(property="ids",         type="array", @OA\Items(type="integer")),
     *     @OA\Property(property="note",        type="string"),
     *     @OA\Property(property="muted_until", type="string", format="date-time")
     *   ))
     * )
     */
    public function bulkMute(BulkAlertRequest $request): JsonResponse
    {
        $note  = (string) $request->input('note', '');
        $until = $request->input('muted_until');
        $count = 0;

        foreach (Alert::whereIn('id', $request->input('ids'))->get() as $alert) {
            $this->applyMute($alert, true, $note, $until);
            $count++;
        }

        return response()->json(['status' => 'ok', 'affected' => $count]);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ALERT RULES — CRUD  (Zabbix: trigger.* parity)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @OA\Get(path="/api/v2/alert-rules",
     *   summary="Cursor-paginated alert rules with search and severity filter",
     *   tags={"Alert Rules v2"},
     *   @OA\Parameter(name="search",   in="query", description="Search rule name and notes"),
     *   @OA\Parameter(name="severity", in="query", description="ok|warning|critical  (comma-separated)"),
     *   @OA\Parameter(name="disabled", in="query", schema=@OA\Schema(type="integer", enum={0,1})),
     *   @OA\Parameter(name="limit",    in="query"),
     *   @OA\Parameter(name="cursor",   in="query")
     * )
     */
    public function listRules(Request $request): JsonResponse
    {
        $q = AlertRule::with([
            'devices:device_id,hostname',
            'groups:id,name',
            'locations:id,location',
        ])->orderByDesc('id');

        if ($s = $request->query('search')) {
            $like = '%' . $s . '%';
            $q->where(fn ($sq) => $sq->where('name', 'like', $like)->orWhere('notes', 'like', $like));
        }
        if ($sev = $request->query('severity')) {
            $q->whereIn('severity', array_map('trim', explode(',', $sev)));
        }
        if ($request->has('disabled')) {
            $q->where('disabled', (bool) $request->query('disabled'));
        }

        $limit = $this->limit($request);
        $paged = $q->cursorPaginate($limit, ['*'], 'cursor');

        return response()->json([
            'status' => 'ok',
            'data'   => $paged->items(),
            'meta'   => $this->cursorMeta($paged, $limit),
        ]);
    }

    /**
     * @OA\Get(path="/api/v2/alert-rules/{id}",
     *   summary="Full rule detail: device/group/location maps, active alerts, operation, fire count",
     *   tags={"Alert Rules v2"}
     * )
     */
    public function showRule(int $id): JsonResponse
    {
        $rule = AlertRule::with([
            'devices:device_id,hostname,sysName',
            'groups:id,name',
            'locations:id,location',
            'alertOperation.segments.transportSingles',
            'alertOperation.segments.transportGroups',
            'alerts' => fn ($q) => $q
                ->whereIn('state', [AlertState::ACTIVE, AlertState::WORSE, AlertState::CHANGED])
                ->with('device:device_id,hostname')
                ->limit(50),
        ])->findOrFail($id);

        // Fires in the last 30 days
        $rule->fires_30d = AlertLog::where('rule_id', $id)
            ->where('time_logged', '>=', now()->subDays(30))
            ->count();

        return response()->json(['status' => 'ok', 'rule' => $rule]);
    }

    /**
     * @OA\Post(path="/api/v2/alert-rules", summary="Create alert rule", tags={"Alert Rules v2"})
     */
    public function createRule(StoreAlertRuleRequest $request): JsonResponse
    {
        $rule = AlertRule::create($request->validated());

        return response()->json(['status' => 'ok', 'rule' => $rule], 201);
    }

    /**
     * @OA\Put(path="/api/v2/alert-rules/{id}", summary="Update alert rule", tags={"Alert Rules v2"})
     */
    public function updateRule(UpdateAlertRuleRequest $request, int $id): JsonResponse
    {
        $rule = AlertRule::findOrFail($id);
        $rule->update($request->validated());

        return response()->json(['status' => 'ok', 'rule' => $rule->fresh()]);
    }

    /**
     * @OA\Delete(path="/api/v2/alert-rules/{id}",
     *   summary="Delete rule — cascades to alerts and alert_log entries",
     *   tags={"Alert Rules v2"}
     * )
     */
    public function deleteRule(int $id): JsonResponse
    {
        AlertRule::findOrFail($id)->delete();

        return response()->json(['status' => 'ok', 'message' => "Rule {$id} deleted"]);
    }

    /**
     * @OA\Patch(path="/api/v2/alert-rules/{id}/toggle",
     *   summary="Toggle rule disabled/enabled state",
     *   tags={"Alert Rules v2"}
     * )
     *
     * Example response: { "status":"ok", "disabled":true, "message":"Rule disabled" }
     */
    public function toggleRule(int $id): JsonResponse
    {
        $rule           = AlertRule::findOrFail($id);
        $rule->disabled = ! $rule->disabled;
        $rule->save();

        return response()->json([
            'status'   => 'ok',
            'disabled' => (bool) $rule->disabled,
            'message'  => 'Rule ' . ($rule->disabled ? 'disabled' : 'enabled'),
        ]);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ALERT LOG  (Zabbix: history.get / event.get parity)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @OA\Get(path="/api/v2/alert-log",
     *   summary="Alert history log — cursor paginated with date-range and component filters",
     *   tags={"Alert Log v2"},
     *   @OA\Parameter(name="device_id", in="query"),
     *   @OA\Parameter(name="hostname",  in="query"),
     *   @OA\Parameter(name="rule_id",   in="query"),
     *   @OA\Parameter(name="state",     in="query", description="0–6 integer state code"),
     *   @OA\Parameter(name="from",      in="query", description="ISO datetime lower bound"),
     *   @OA\Parameter(name="to",        in="query", description="ISO datetime upper bound"),
     *   @OA\Parameter(name="limit",     in="query"),
     *   @OA\Parameter(name="cursor",    in="query")
     * )
     */
    public function alertLog(Request $request): JsonResponse
    {
        $q = AlertLog::with([
            'device:device_id,hostname,sysName',
            'rule:id,name,severity',
        ])->orderByDesc('id');

        if ($d = $request->query('device_id')) {
            $q->where('alert_log.device_id', (int) $d);
        } elseif ($h = $request->query('hostname')) {
            $dev = Device::where('hostname', $h)->orWhere('ip', $h)->first(['device_id']);
            $q->where('alert_log.device_id', $dev?->device_id ?? -1);
        }

        if ($r = $request->query('rule_id')) { $q->where('alert_log.rule_id', (int) $r); }
        if ($s = $request->query('state'))   { $q->where('alert_log.state',   (int) $s); }
        if ($f = $request->query('from'))    { $q->where('time_logged', '>=', $f); }
        if ($t = $request->query('to'))      { $q->where('time_logged', '<=', $t); }

        $limit = $this->limit($request);
        $paged = $q->cursorPaginate($limit, ['alert_log.*'], 'cursor');

        return response()->json([
            'status' => 'ok',
            'data'   => $paged->items(),
            'meta'   => $this->cursorMeta($paged, $limit),
        ]);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TRANSPORTS  (Zabbix: mediatype.* parity)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @OA\Get(path="/api/v2/alert-transports", summary="List transports", tags={"Transports v2"})
     */
    public function listTransports(): JsonResponse
    {
        return response()->json([
            'status'     => 'ok',
            'transports' => AlertTransport::all(['transport_id', 'transport_name', 'transport_type', 'is_default']),
        ]);
    }

    /**
     * @OA\Get(path="/api/v2/alert-transports/{id}", summary="Get transport with full config", tags={"Transports v2"})
     */
    public function showTransport(int $id): JsonResponse
    {
        return response()->json(['status' => 'ok', 'transport' => AlertTransport::findOrFail($id)]);
    }

    /**
     * @OA\Post(path="/api/v2/alert-transports", summary="Create transport", tags={"Transports v2"})
     */
    public function createTransport(StoreTransportRequest $request): JsonResponse
    {
        $t = new AlertTransport;
        $t->transport_name   = $request->input('transport_name');
        $t->transport_type   = $request->input('transport_type');
        $t->is_default       = (bool) $request->input('is_default', false);
        $t->transport_config = $request->input('transport_config', []);
        $t->save();

        return response()->json(['status' => 'ok', 'transport' => $t], 201);
    }

    /**
     * @OA\Put(path="/api/v2/alert-transports/{id}", summary="Update transport config or name", tags={"Transports v2"})
     */
    public function updateTransport(UpdateTransportRequest $request, int $id): JsonResponse
    {
        $t = AlertTransport::findOrFail($id);

        if ($request->has('transport_name'))   { $t->transport_name   = $request->input('transport_name'); }
        if ($request->has('is_default'))       { $t->is_default       = (bool) $request->input('is_default'); }
        if ($request->has('transport_config')) { $t->transport_config = $request->input('transport_config'); }
        $t->save();

        return response()->json(['status' => 'ok', 'transport' => $t]);
    }

    /**
     * @OA\Delete(path="/api/v2/alert-transports/{id}", summary="Delete transport", tags={"Transports v2"})
     */
    public function deleteTransport(int $id): JsonResponse
    {
        AlertTransport::findOrFail($id)->delete();

        return response()->json(['status' => 'ok', 'message' => "Transport {$id} deleted"]);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Apply all shared alert filters to the given query builder.
     * Uses whereHas (subqueries) for severity/search to keep ORDER BY stable
     * for cursor pagination.
     */
    private function applyAlertFilters($q, Request $request): void
    {
        // State
        $state = $request->query('state', 'active');
        if ($state !== 'all') {
            $states = array_filter(
                array_map(fn ($s) => self::STATE_MAP[trim($s)] ?? null, explode(',', $state))
            );
            if ($states) {
                $q->whereIn('alerts.state', array_values($states));
            }
        }

        // Severity — use whereHas to avoid join conflicts with cursor pagination
        if ($sev = $request->query('severity')) {
            $sevs = array_map('trim', explode(',', $sev));
            $q->whereHas('rule', fn ($r) => $r->whereIn('severity', $sevs));
        }

        // Device (id takes precedence over hostname)
        if ($did = $request->query('device_id')) {
            $q->where('alerts.device_id', (int) $did);
        } elseif ($h = $request->query('hostname')) {
            $dev = Device::where('hostname', $h)->orWhere('ip', $h)->first(['device_id']);
            $q->where('alerts.device_id', $dev?->device_id ?? -1);
        }

        // Rule
        if ($rid = $request->query('rule_id')) {
            $q->where('alerts.rule_id', (int) $rid);
        }

        // Full-text search: hostname, sysName, rule name, note
        if ($s = $request->query('search')) {
            $like = '%' . $s . '%';
            $q->where(function ($sub) use ($like) {
                $sub->whereHas('device', fn ($d) => $d->where('hostname', 'like', $like)
                                                       ->orWhere('sysName',  'like', $like))
                    ->orWhereHas('rule',   fn ($r) => $r->where('name', 'like', $like))
                    ->orWhere('alerts.note', 'like', $like);
            });
        }

        // Muted filter (stored in MariaDB/MySQL JSON field)
        if ($request->has('muted')) {
            if ((bool) $request->query('muted')) {
                $q->whereRaw("JSON_EXTRACT(alerts.info, '$.muted') = true");
            } else {
                $q->whereRaw(
                    "(JSON_EXTRACT(alerts.info, '$.muted') IS NULL OR JSON_EXTRACT(alerts.info, '$.muted') != true)"
                );
            }
        }

        // Time bounds
        if ($after  = $request->query('after'))  { $q->where('alerts.timestamp', '>=', $after); }
        if ($before = $request->query('before')) { $q->where('alerts.timestamp', '<=', $before); }
    }

    /**
     * Compact summary row for list responses.
     * Keeping it flat avoids N+1 and reduces response payload.
     */
    private function summarise(Alert $alert): array
    {
        $info = $alert->info ?? [];

        return [
            'id'           => $alert->id,
            'device_id'    => $alert->device_id,
            'rule_id'      => $alert->rule_id,
            'state'        => self::STATE_LABELS[$alert->state] ?? $alert->state,
            'state_code'   => $alert->state,
            'severity'     => $alert->rule?->severity  ?? 'unknown',
            'rule_name'    => $alert->rule?->name      ?? '',
            'hostname'     => $alert->device?->hostname ?? '',
            'sysName'      => $alert->device?->sysName  ?? '',
            'device_status'=> $alert->device?->status,
            'note'         => $alert->note,
            'timestamp'    => $alert->timestamp,
            'muted'        => (bool) ($info['muted']      ?? false),
            'muted_until'  => $info['muted_until']         ?? null,
            'until_clear'  => (bool) ($info['until_clear'] ?? false),
        ];
    }

    /**
     * Detect which network component triggered the alert.
     *
     * Strategy: load the most recent alert_log entry for this device+rule pair.
     * The `details` field (CompressedJson) contains the raw query-result rows
     * that triggered the alert. We inspect keys to determine component type.
     *
     * Supported types: port | sensor | bgp | mempool | processor | storage | service | process | device
     */
    private function detectComponent(Alert $alert): array
    {
        $log = AlertLog::where('device_id', $alert->device_id)
            ->where('rule_id',   $alert->rule_id)
            ->orderByDesc('time_logged')
            ->first(['details']);

        $raw = $log?->details ?? [];

        // details can be a list-of-rows or a single row
        $row = is_array($raw) && array_is_list($raw) ? ($raw[0] ?? []) : (array) $raw;

        if (isset($row['port_id'])) {
            $port = Port::find($row['port_id'], [
                'port_id', 'ifName', 'ifAlias', 'ifOperStatus', 'ifAdminStatus',
                'ifSpeed', 'ifInOctets_rate', 'ifOutOctets_rate', 'ifMtu',
            ]);

            return ['type' => 'port', 'id' => $row['port_id'], 'data' => $port, 'context' => $row];
        }

        if (isset($row['sensor_id'])) {
            $sensor = Sensor::find($row['sensor_id'], [
                'sensor_id', 'sensor_class', 'sensor_descr', 'sensor_current',
                'sensor_limit', 'sensor_limit_warn', 'sensor_limit_low', 'sensor_limit_low_warn',
            ]);

            return ['type' => 'sensor', 'id' => $row['sensor_id'], 'data' => $sensor, 'context' => $row];
        }

        if (isset($row['bgpPeer_id'])) {
            $bgp = BgpPeer::find($row['bgpPeer_id'], [
                'bgpPeer_id', 'bgpPeerIdentifier', 'bgpPeerState', 'bgpPeerAdminStatus',
                'bgpPeerRemoteAs', 'bgpPeerDescr', 'astext',
            ]);

            return ['type' => 'bgp', 'id' => $row['bgpPeer_id'], 'data' => $bgp, 'context' => $row];
        }

        if (isset($row['mempool_id'])) {
            return ['type' => 'mempool',   'id' => $row['mempool_id'],   'data' => null, 'context' => $row];
        }

        if (isset($row['processor_id'])) {
            return ['type' => 'processor', 'id' => $row['processor_id'], 'data' => null, 'context' => $row];
        }

        if (isset($row['storage_id'])) {
            return ['type' => 'storage',   'id' => $row['storage_id'],   'data' => null, 'context' => $row];
        }

        if (isset($row['service_id'])) {
            return ['type' => 'service',   'id' => $row['service_id'],   'data' => null, 'context' => $row];
        }

        // Fallback: process alert (rule.proc field set) or plain device alert
        if ($alert->rule?->proc) {
            return ['type' => 'process', 'id' => null, 'data' => ['proc' => $alert->rule->proc], 'context' => $row];
        }

        return ['type' => 'device', 'id' => $alert->device_id, 'data' => null, 'context' => $row];
    }

    /**
     * Build graph URL list for a given component type.
     * URLs point to LibreNMS /graph endpoint (proxied via Vite or direct).
     * Device-level uptime + availability graphs are always appended.
     */
    private function buildGraphUrls(Alert $alert, array $component): array
    {
        $did  = $alert->device_id;
        $from = '-6h';

        $url = fn (array $params) => '/graph?' . http_build_query(
            array_merge(['from' => $from, 'to' => 'now', 'width' => 400, 'height' => 100, 'lazy' => 1], $params)
        );

        $graphs = match ($component['type']) {
            'port' => [
                ['label' => 'Traffic (bits/s)', 'url' => $url(['type' => 'port_bits',   'id' => $component['id']])],
                ['label' => 'Errors',           'url' => $url(['type' => 'port_errors', 'id' => $component['id']])],
                ['label' => 'Packets',          'url' => $url(['type' => 'port_pkts',   'id' => $component['id']])],
            ],
            'sensor' => (function () use ($component, $did, $url) {
                $cls = $component['data']?->sensor_class
                    ?? $component['context']['sensor_class']
                    ?? 'temperature';

                return [['label' => ucfirst($cls), 'url' => $url(['type' => "device_{$cls}", 'id' => $did])]];
            })(),
            'processor' => [
                ['label' => 'CPU',    'url' => $url(['type' => 'device_processor', 'id' => $did])],
            ],
            'mempool' => [
                ['label' => 'Memory', 'url' => $url(['type' => 'device_mempool',   'id' => $did])],
            ],
            'storage' => [
                ['label' => 'Storage','url' => $url(['type' => 'device_storage',   'id' => $did])],
            ],
            'bgp' => [
                ['label' => 'BGP Updates', 'url' => $url(['type' => 'device_bgp',  'id' => $did])],
            ],
            default => [],
        };

        // Device-level context graphs — always included
        $graphs[] = ['label' => 'CPU Overall',  'url' => $url(['type' => 'device_processor',    'id' => $did])];
        $graphs[] = ['label' => 'Uptime',       'url' => $url(['type' => 'device_uptime',       'id' => $did])];
        $graphs[] = ['label' => 'Availability', 'url' => $url(['type' => 'device_availability', 'id' => $did])];

        return $graphs;
    }

    /**
     * Return last 12 state changes for the alert as a severity trend array.
     * Used to detect "got worse → better → worse" oscillation patterns.
     */
    private function severityTrend(Alert $alert): array
    {
        return AlertLog::where('device_id', $alert->device_id)
            ->where('rule_id', $alert->rule_id)
            ->orderByDesc('time_logged')
            ->limit(12)
            ->get(['state', 'time_logged'])
            ->map(fn ($l) => [
                'state' => is_object($l->state) ? $l->state->name : (self::STATE_LABELS[(int) $l->state] ?? (string) $l->state),
                'time'  => $l->time_logged,
            ])
            ->toArray();
    }

    /**
     * Collect related active alerts:
     *   - same_device: other rules firing on the same device (context/correlation)
     *   - same_rule:   same rule firing on other devices (scope/spread detection)
     */
    private function relatedAlerts(Alert $alert): array
    {
        $activeStates = [AlertState::ACTIVE, AlertState::WORSE, AlertState::CHANGED];

        $sameDevice = Alert::with(['rule:id,name,severity'])
            ->where('device_id', $alert->device_id)
            ->where('id', '!=', $alert->id)
            ->whereIn('state', $activeStates)
            ->limit(10)
            ->get()
            ->map(fn ($a) => array_merge($this->summarise($a), ['relation' => 'same_device']));

        $sameRule = Alert::with(['device:device_id,hostname,sysName'])
            ->where('rule_id', $alert->rule_id)
            ->where('id', '!=', $alert->id)
            ->whereIn('state', $activeStates)
            ->limit(10)
            ->get()
            ->map(fn ($a) => array_merge($this->summarise($a), ['relation' => 'same_rule']));

        return array_merge($sameDevice->toArray(), $sameRule->toArray());
    }

    /**
     * Acknowledge: set state → ACKNOWLEDGED, append audit entry to note, set until_clear in info.
     */
    private function applyAck(Alert $alert, string $note, bool $untilClear): void
    {
        $ts   = now()->toDateTimeString();
        $user = $this->currentUser();

        $alert->state = AlertState::ACKNOWLEDGED;
        $alert->note  = "[{$ts}] {$user}: {$note}";
        $info = $alert->info ?? [];
        $info['until_clear'] = $untilClear;
        $alert->info = $info;
        $alert->save();
    }

    /**
     * Mute/unmute: toggle info.muted — does NOT change alert state.
     * Transport handlers should check this flag before sending notifications.
     */
    private function applyMute(Alert $alert, bool $muted, string $note, ?string $until): void
    {
        $ts   = now()->toDateTimeString();
        $user = $this->currentUser();

        $info = $alert->info ?? [];
        $info['muted']      = $muted;
        $info['muted_by']   = $user;
        $info['muted_at']   = $ts;
        $info['muted_until'] = $until;
        $alert->info = $info;

        if ($note !== '') {
            $action      = $muted ? 'muted' : 'unmuted';
            $alert->note = ($alert->note ? $alert->note . "\n" : '') . "[{$ts}] {$user} {$action}: {$note}";
        }

        $alert->save();
    }

    /**
     * Resolve limit query param (1–500, default 50).
     */
    private function limit(Request $request): int
    {
        return min(max((int) $request->query('limit', 50), 1), 500);
    }

    /**
     * Build cursor pagination meta block.
     */
    private function cursorMeta($paged, int $limit): array
    {
        return [
            'limit'       => $limit,
            'next_cursor' => $paged->nextCursor()?->encode(),
            'prev_cursor' => $paged->previousCursor()?->encode(),
            'has_more'    => $paged->hasMorePages(),
        ];
    }

    /**
     * Return authenticated username or 'api' for unauthenticated requests.
     */
    private function currentUser(): string
    {
        return Auth::user()?->username ?? 'api';
    }
}
