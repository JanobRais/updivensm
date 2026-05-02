<?php

/*
 * UpdiveNSM
 *
 * Copyright (c) 2016 Søren Friis Rosiak <sorenrosiak@gmail.com>
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.  Please see LICENSE.txt at the top level of
 * the source code distribution for details.
 */

namespace UpdiveNSM\Alert\Transport;

use App\Facades\UpdiveNSMConfig;
use UpdiveNSM\Alert\Transport;
use UpdiveNSM\Exceptions\AlertTransportDeliveryException;
use UpdiveNSM\Util\Http;

class Osticket extends Transport
{
    protected string $name = 'osTicket';

    public function deliverAlert(array $alert_data): bool
    {
        $url = $this->config['os-url'];
        $token = $this->config['os-token'];
        $email = '';

        foreach (\UpdiveNSM\Util\Mail::parseEmails((string) UpdiveNSMConfig::get('email_from')) as $from => $from_name) {
            $email = $from_name . ' <' . $from . '>';
            break;
        }

        $protocol = [
            'name' => 'UpdiveNSM',
            'email' => $email,
            'subject' => ($alert_data['name'] ? $alert_data['name'] . ' on ' . $alert_data['hostname'] : $alert_data['title']),
            'message' => strip_tags((string) $alert_data['msg']),
            'ip' => $_SERVER['REMOTE_ADDR'],
            'attachments' => [],
        ];

        $res = Http::client()->withHeaders([
            'X-API-Key' => $token,
        ])->post($url, $protocol);

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
                    'title' => 'API URL',
                    'name' => 'os-url',
                    'descr' => 'osTicket API URL',
                    'type' => 'text',
                ],
                [
                    'title' => 'API Token',
                    'name' => 'os-token',
                    'descr' => 'osTicket API Token',
                    'type' => 'password',
                ],
            ],
            'validation' => [
                'os-url' => 'required|url',
                'os-token' => 'required|string',
            ],
        ];
    }
}
