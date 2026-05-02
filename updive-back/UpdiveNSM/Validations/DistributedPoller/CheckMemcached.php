<?php

/**
 * CheckMemcached.php
 *
 * -Description-
 *
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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * @link       https://www.UpdiveNSM.org
 *
 * @copyright  2022 Tony Murray
 * @author     Tony Murray <murraytony@gmail.com>
 */

namespace UpdiveNSM\Validations\DistributedPoller;

use App\Facades\UpdiveNSMConfig;
use Illuminate\Support\Facades\Config;
use UpdiveNSM\Interfaces\Validation;
use UpdiveNSM\ValidationResult;

class CheckMemcached implements Validation
{
    /**
     * @inheritDoc
     */
    public function validate(): ValidationResult
    {
        if (! UpdiveNSMConfig::get('distributed_poller_memcached_host')) {
            return ValidationResult::fail(trans('validation.validations.distributedpoller.CheckMemcached.not_configured_host'), 'lnms config:set distributed_poller_memcached_host <hostname>');
        }

        if (! UpdiveNSMConfig::get('distributed_poller_memcached_port')) {
            return ValidationResult::fail(trans('validation.validations.distributedpoller.CheckMemcached.not_configured_port'), 'lnms config:set distributed_poller_memcached_port <port>');
        }

        $connection = @fsockopen(UpdiveNSMConfig::get('distributed_poller_memcached_host'), UpdiveNSMConfig::get('distributed_poller_memcached_port'));
        if (! is_resource($connection)) {
            return ValidationResult::fail(trans('validation.validations.distributedpoller.CheckMemcached.could_not_connect'));
        }

        fclose($connection);

        return ValidationResult::ok(trans('validation.validations.distributedpoller.CheckMemcached.ok'));
    }

    /**
     * @inheritDoc
     */
    public function enabled(): bool
    {
        return UpdiveNSMConfig::get('distributed_poller') && Config::get('cache.default') == 'memcached';
    }
}
