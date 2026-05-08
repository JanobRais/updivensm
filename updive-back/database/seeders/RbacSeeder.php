<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;
use Spatie\Permission\Models\Permission;

class RbacSeeder extends Seeder
{
    // Permissions grouped by role level
    // super-admin  → all permissions (wildcard)
    // admin        → device + user + alert + settings management
    // operator     → device CRUD, alerts, NO users/settings
    // viewer       → view-only permissions
    // global-read  → same as viewer (existing role, bring in sync)

    private array $viewerPerms = [
        'api.access',
        'alert.view', 'alert.viewAny', 'alert.detail',
        'alert-rule.view', 'alert-rule.viewAny',
        'alert-schedule.view', 'alert-schedule.viewAny',
        'alert-template.view',
        'alert-transport.view',
        'alert-operation.view', 'alert-operation.viewAny',
        'bill.view', 'bill.viewAny',
        'custom-map.view', 'custom-map.viewAny',
        'customoid.view',
        'device.view', 'device.viewAny',
        'device-group.view', 'device-group.viewAny',
        'link.viewAny',
        'location.view', 'location.viewAny',
        'poller.view', 'poller.viewAny',
        'poller-group.viewAny',
        'port.view', 'port.viewAny',
        'port-group.viewAny',
        'routing.view', 'routing.viewAny',
        'service.view',
        'service-template.view', 'service-template.viewAny',
        'settings.viewAny',
        'ssl-certificate.view', 'ssl-certificate.viewAny',
        'user.view', 'user.viewAny',
        'vlan.viewAny',
        'role.viewAny',
    ];

    private array $operatorPerms = [
        // Everything viewer can do, plus:
        'alert.update', 'alert.delete',
        'alert-rule.create', 'alert-rule.update', 'alert-rule.delete',
        'alert-schedule.create', 'alert-schedule.update', 'alert-schedule.delete',
        'alert-operation.create', 'alert-operation.update', 'alert-operation.delete',
        'alert-template.create', 'alert-template.update', 'alert-template.delete',
        'alert-transport.create', 'alert-transport.update', 'alert-transport.delete',
        'device.create', 'device.update', 'device.delete', 'device.updateNotes',
        'device-group.create', 'device-group.update', 'device-group.delete',
        'location.create', 'location.update', 'location.delete',
        'port.update', 'port.delete',
        'port-group.create', 'port-group.update', 'port-group.delete',
        'service.create', 'service.update', 'service.delete',
        'custom-map.create', 'custom-map.update', 'custom-map.delete',
        'customoid.create', 'customoid.update', 'customoid.delete',
        'component.update',
        'processor.update',
        'mempool.update',
        'routing.update',
        'wireless-sensor.update', 'wireless-sensor.delete',
    ];

    private array $adminPerms = [
        // Everything operator can do, plus:
        'user.create', 'user.update', 'user.delete',
        'settings.update',
        'poller.update', 'poller.delete',
        'poller-group.create', 'poller-group.update', 'poller-group.delete',
        'bill.create', 'bill.update', 'bill.delete',
        'service-template.create', 'service-template.update', 'service-template.delete',
        'ssl-certificate.create', 'ssl-certificate.update', 'ssl-certificate.delete',
        'auth-log.view',
        'notification.create', 'notification.update',
        'role.update',
        'plugin.admin',
        'dashboard.copy',
        'application.update',
        'syslog.delete',
        'oxidized.refresh', 'oxidized.search',
    ];

    public function run(): void
    {
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        // Ensure all required permissions exist (create if missing)
        $allNeeded = array_unique(array_merge($this->viewerPerms, $this->operatorPerms, $this->adminPerms));
        foreach ($allNeeded as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }

        // ── Create roles ──────────────────────────────────────────────
        $superAdmin  = Role::firstOrCreate(['name' => 'super-admin',  'guard_name' => 'web']);
        $adminRole   = Role::firstOrCreate(['name' => 'admin',        'guard_name' => 'web']);
        $operatorRole= Role::firstOrCreate(['name' => 'operator',     'guard_name' => 'web']);
        $viewerRole  = Role::firstOrCreate(['name' => 'viewer',       'guard_name' => 'web']);
        $globalRead  = Role::firstOrCreate(['name' => 'global-read',  'guard_name' => 'web']);
        $userRole    = Role::firstOrCreate(['name' => 'user',         'guard_name' => 'web']);

        // ── Assign permissions ─────────────────────────────────────────
        // super-admin gets ALL permissions
        $superAdmin->syncPermissions(Permission::where('guard_name', 'web')->pluck('name')->toArray());

        // admin = viewer + operator + admin-level
        $adminRole->syncPermissions(array_unique(array_merge(
            $this->viewerPerms, $this->operatorPerms, $this->adminPerms
        )));

        // operator = viewer + operator-level
        $operatorRole->syncPermissions(array_unique(array_merge(
            $this->viewerPerms, $this->operatorPerms
        )));

        // viewer = read-only
        $viewerRole->syncPermissions($this->viewerPerms);

        // global-read = same as viewer
        $globalRead->syncPermissions($this->viewerPerms);

        // user = basic viewer (api.access + device/alert view)
        $userRole->syncPermissions([
            'api.access',
            'alert.view', 'alert.viewAny', 'alert.detail',
            'device.view', 'device.viewAny',
            'port.view', 'port.viewAny',
        ]);

        $this->command->info('RBAC roles seeded:');
        $this->command->table(
            ['Role', 'Permissions'],
            [
                ['super-admin',  Permission::count() . ' (all)'],
                ['admin',        count(array_unique(array_merge($this->viewerPerms, $this->operatorPerms, $this->adminPerms)))],
                ['operator',     count(array_unique(array_merge($this->viewerPerms, $this->operatorPerms)))],
                ['viewer',       count($this->viewerPerms)],
                ['global-read',  count($this->viewerPerms)],
                ['user',         7],
            ]
        );
    }
}
