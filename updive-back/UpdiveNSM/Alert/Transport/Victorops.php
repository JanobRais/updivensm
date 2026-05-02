<?php

/* Copyright (C) 2015 Daniel Preussker <f0o@devilcode.org>
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>. */

/**
 * VictorOps Generic-API Transport - Based on PagerDuty transport
 *
 * @author f0o <f0o@devilcode.org>
 * @author laf <neil@UpdiveNSM.org>
 * @copyright 2015 f0o, laf, UpdiveNSM
 * @license GPL
 */

namespace UpdiveNSM\Alert\Transport;

use UpdiveNSM\Alert\Transport;
use UpdiveNSM\Enum\AlertState;
use UpdiveNSM\Exceptions\AlertTransportDeliveryException;
use UpdiveNSM\Util\Http;

class Victorops extends Transport
{
    protected string $name = 'Splunk On-Call';

    public function deliverAlert(array $alert_data): bool
    {
        $url = $this->config['victorops-url'];
        $protocol = [
            'entity_id' => strval($alert_data['id'] ?: $alert_data['uid']),
            'state_start_time' => strtotime((string) $alert_data['timestamp']),
            'entity_display_name' => $alert_data['title'],
            'state_message' => $alert_data['msg'],
            'monitoring_tool' => 'UpdiveNSM',
        ];
        $protocol['message_type'] = match ($alert_data['state']) {
            AlertState::RECOVERED => 'RECOVERY',
            AlertState::ACKNOWLEDGED => 'ACKNOWLEDGEMENT',
            default => match ($alert_data['severity']) {
                'ok' => 'INFO',
                'warning' => 'WARNING',
                default => 'CRITICAL',
            },
        };

        foreach ($alert_data['faults'] as $data) {
            $protocol['state_message'] .= $data['string'];
        }

        $res = Http::client()->post($url, $protocol);

        if ($res->successful()) {
            return true;
        }

        throw new AlertTransportDeliveryException($alert_data, $res->status(), $res->body(), $alert_data['msg'], $protocol);
    }

    public static function configTemplate(): array
    {
        return [
            'config' => [
                [
                    'title' => 'Post URL',
                    'name' => 'victorops-url',
                    'descr' => 'Victorops Post URL',
                    'type' => 'text',
                ],
            ],
            'validation' => [
                'victorops-url' => 'required|string',
            ],
        ];
    }
}
