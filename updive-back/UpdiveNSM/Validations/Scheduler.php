<?php

/**
 * Scheduler.php
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
 */

namespace UpdiveNSM\Validations;

use App\Facades\UpdiveNSMConfig;
use Exception;
use Illuminate\Support\Facades\Cache;
use UpdiveNSM\ValidationResult;
use UpdiveNSM\Validator;

class Scheduler extends BaseValidation
{
    /**
     * Validate this module.
     * To return ValidationResults, call ok, warn, fail, or result methods on the $validator
     *
     * @param  Validator  $validator
     */
    public function validate(Validator $validator): void
    {
        try {
            $scheduler_working = Cache::has('scheduler_working');
        } catch (Exception $e) {
            $validator->fail(trans('validation.validations.poller.CheckLocking.fail', ['message' => $e->getMessage()]));

            return;
        }

        if (! $scheduler_working) {
            $commands = $this->generateCommands($validator);
            $validator->result(ValidationResult::fail('Scheduler is not running')->setFix($commands));
        }
    }

    /**
     * @param  Validator  $validator
     * @return array
     */
    private function generateCommands(Validator $validator): array
    {
        $commands = [];
        $systemctl_bin = UpdiveNSMConfig::locateBinary('systemctl');
        $base_dir = rtrim($validator->getBaseDir(), '/');

        if (is_executable($systemctl_bin)) {
            // systemd exists
            if ($base_dir === '/opt/UpdiveNSM') {
                // standard install dir
                $commands[] = 'sudo cp /opt/UpdiveNSM/dist/UpdiveNSM-scheduler.service /opt/UpdiveNSM/dist/UpdiveNSM-scheduler.timer /etc/systemd/system/';
            } else {
                // non-standard install dir
                $commands[] = "sudo sh -c 'sed \"s#/opt/UpdiveNSM#$base_dir#\" $base_dir/dist/UpdiveNSM-scheduler.service > /etc/systemd/system/UpdiveNSM-scheduler.service'";
                $commands[] = "sudo sh -c 'sed \"s#/opt/UpdiveNSM#$base_dir#\" $base_dir/dist/UpdiveNSM-scheduler.timer > /etc/systemd/system/UpdiveNSM-scheduler.timer'";
            }
            $commands[] = 'sudo systemctl enable UpdiveNSM-scheduler.timer';
            $commands[] = 'sudo systemctl start UpdiveNSM-scheduler.timer';

            return $commands;
        }

        // non-systemd use cron
        if ($base_dir === '/opt/UpdiveNSM') {
            $commands[] = 'sudo cp /opt/UpdiveNSM/dist/UpdiveNSM-scheduler.cron /etc/cron.d/';

            return $commands;
        }

        // non-standard install dir
        $commands[] = "sudo sh -c 'sed \"s#/opt/UpdiveNSM#$base_dir#\" $base_dir/dist/UpdiveNSM-scheduler.cron > /etc/cron.d/UpdiveNSM-scheduler.cron'";

        return $commands;
    }
}
