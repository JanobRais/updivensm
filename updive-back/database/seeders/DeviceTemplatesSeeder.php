<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Yaml\Yaml;

class DeviceTemplatesSeeder extends Seeder
{
    private const OS_DIR = __DIR__ . '/../../resources/definitions/os_detection';

    private const TYPE_MAP = [
        'network'   => 'network',
        'server'    => 'server',
        'printer'   => 'printer',
        'storage'   => 'server',
        'power'     => 'ups',
        'ups'       => 'ups',
        'camera'    => 'camera',
        'wireless'  => 'network',
        'firewall'  => 'network',
        'loadbalancer' => 'network',
        'sensor'    => 'other',
        'environment' => 'other',
        'management'  => 'other',
        'voip'      => 'other',
        'copier'    => 'printer',
        'workstation' => 'server',
    ];

    private const VALID_TYPES = ['network', 'server', 'camera', 'printer', 'ups', 'other'];

    public function run(): void
    {
        if (! class_exists(Yaml::class)) {
            $this->command->warn('symfony/yaml not found — skipping YAML import.');
            return;
        }

        if (! is_dir(self::OS_DIR)) {
            $this->command->warn('OS definitions directory not found.');
            return;
        }

        $files   = glob(self::OS_DIR . '/*.yaml');
        $count   = 0;
        $skipped = 0;
        $now     = now();

        foreach ($files as $file) {
            try {
                $yaml = Yaml::parseFile($file);
            } catch (\Exception $e) {
                $skipped++;
                continue;
            }

            $osName = $yaml['os'] ?? pathinfo($file, PATHINFO_FILENAME);
            if (empty($osName)) { $skipped++; continue; }

            // Map type
            $rawType = strtolower($yaml['type'] ?? 'network');
            $type    = self::TYPE_MAP[$rawType] ?? (in_array($rawType, self::VALID_TYPES) ? $rawType : 'other');

            // Vendor from group or icon or os name
            $vendor = $this->guessVendor($yaml);

            // Display name
            $displayName = $yaml['text'] ?? $osName;

            // sysObjectIDs from discovery
            $sysOids = [];
            foreach ($yaml['discovery'] ?? [] as $rule) {
                if (! is_array($rule)) continue;
                $oids = $rule['sysObjectID'] ?? [];
                foreach ((is_array($oids) ? $oids : [$oids]) as $oid) {
                    // strip inline comments
                    $oid = trim(preg_replace('/#.*$/', '', (string) $oid));
                    if ($oid) $sysOids[] = $oid;
                }
            }

            // sysDescr patterns from discovery
            $sysDescr = [];
            foreach ($yaml['discovery'] ?? [] as $rule) {
                if (! is_array($rule)) continue;
                $descrs = $rule['sysDescr'] ?? [];
                foreach ((is_array($descrs) ? $descrs : [$descrs]) as $d) {
                    $d = trim((string) $d);
                    if ($d) $sysDescr[] = $d;
                }
            }

            // MIB dirs
            $mibDirs = [];
            if (! empty($yaml['mib_dir'])) {
                $mibDirs = is_array($yaml['mib_dir']) ? $yaml['mib_dir'] : [$yaml['mib_dir']];
            }

            // Modules from poller_modules (enabled ones)
            $modules = $this->extractModules($yaml);

            DB::table('device_templates')->updateOrInsert(
                ['os_name' => $osName],
                [
                    'name'               => $displayName,
                    'vendor'             => $vendor,
                    'display_name'       => $displayName,
                    'type'               => $type,
                    'icon'               => $yaml['icon'] ?? '',
                    'description'        => $this->buildDescription($yaml),
                    'sys_object_ids'     => json_encode(array_values(array_unique($sysOids))),
                    'sys_descr_patterns' => json_encode(array_values(array_unique($sysDescr))),
                    'mib_dirs'           => json_encode($mibDirs),
                    'modules'            => json_encode($modules),
                    'custom_oids'        => json_encode([]),
                    'builtin'            => true,
                    'created_at'         => $now,
                    'updated_at'         => $now,
                ]
            );

            $count++;
        }

        $this->command->info("Device templates seeded: {$count} from YAML, {$skipped} skipped.");
    }

    private function guessVendor(array $yaml): string
    {
        $icon  = $yaml['icon']  ?? '';
        $group = $yaml['group'] ?? '';
        $os    = $yaml['os']    ?? '';

        $map = [
            'cisco'    => 'Cisco',    'ciscosb'  => 'Cisco',  'ciscowlc' => 'Cisco',
            'eltex'    => 'Eltex',    'mikrotik' => 'MikroTik',
            'juniper'  => 'Juniper',  'junos'    => 'Juniper',
            'huawei'   => 'Huawei',   'vrp'      => 'Huawei',
            'hp'       => 'HP',       'procurve' => 'HP',     'aruba' => 'HP',
            'apc'      => 'APC',
            'hikvision'=> 'Hikvision',
            'linux'    => 'Generic',  'windows'  => 'Microsoft',
            'fortinet' => 'Fortinet', 'paloalto' => 'Palo Alto',
            'f5'       => 'F5',       'bigip'    => 'F5',
            'netscaler'=> 'Citrix',   'citrix'   => 'Citrix',
            'dell'     => 'Dell',     'ibm'      => 'IBM',
            'brocade'  => 'Brocade',  'foundry'  => 'Brocade',
            'extreme'  => 'Extreme',  'avaya'    => 'Avaya',
            'radlan'   => 'Eltex',    'dlink'    => 'D-Link',
            'ubiquiti' => 'Ubiquiti', 'unifi'    => 'Ubiquiti',
            'calix'    => 'Calix',    'cambium'  => 'Cambium',
            'mimosa'   => 'Mimosa',   'siklu'    => 'Siklu',
            'comtrend' => 'Comtrend','zyxel'    => 'ZyXEL',
            'synology' => 'Synology', 'qnap'     => 'QNAP',
            'vmware'   => 'VMware',   'esx'      => 'VMware',
        ];

        foreach ([$icon, $group, $os] as $src) {
            $lower = strtolower($src);
            foreach ($map as $key => $vendor) {
                if (str_contains($lower, $key)) return $vendor;
            }
        }

        // Capitalize first segment of os name
        $parts = preg_split('/[-_]/', $os);
        return ucfirst($parts[0] ?? 'Unknown');
    }

    private function extractModules(array $yaml): array
    {
        $modules = ['ports', 'uptime'];

        $pollerModules = $yaml['poller_modules'] ?? [];

        // CPU and memory always available from standard modules
        $modules[] = 'cpu';
        $modules[] = 'memory';

        // Health sensors
        $modules[] = 'health';

        // BGP
        if (! empty($pollerModules['bgp-peers']) || str_contains($yaml['os'] ?? '', 'bgp')) {
            $modules[] = 'bgp';
        }

        // OSPF
        if (! empty($yaml['discovery_modules']['ospf']) || ! empty($pollerModules['ospf'])) {
            $modules[] = 'ospf';
        }

        // Ping
        $modules[] = 'ping';

        return array_values(array_unique($modules));
    }

    private function buildDescription(array $yaml): string
    {
        $parts = [];
        if (! empty($yaml['group'])) $parts[] = 'Group: ' . $yaml['group'];
        if (! empty($yaml['mib_dir'])) {
            $mib = is_array($yaml['mib_dir']) ? implode(', ', $yaml['mib_dir']) : $yaml['mib_dir'];
            $parts[] = 'MIB: ' . $mib;
        }
        return implode(' | ', $parts);
    }
}
