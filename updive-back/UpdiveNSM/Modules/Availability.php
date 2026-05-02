<?php

/**
 * Availability.php
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
 * @copyright  2023 Tony Murray
 * @author     Tony Murray <murraytony@gmail.com>
 */

namespace UpdiveNSM\Modules;

use App\Facades\UpdiveNSMConfig;
use App\Models\Device;
use UpdiveNSM\Interfaces\Data\DataStorageInterface;
use UpdiveNSM\Interfaces\Module;
use UpdiveNSM\OS;
use UpdiveNSM\Polling\ModuleStatus;
use UpdiveNSM\RRD\RrdDefinition;
use UpdiveNSM\Util\Time;

class Availability implements Module
{
    /**
     * @inheritDoc
     */
    public function dependencies(): array
    {
        return [];
    }

    public function shouldDiscover(OS $os, ModuleStatus $status): bool
    {
        return false;
    }

    /**
     * @inheritDoc
     */
    public function discover(OS $os): void
    {
    }

    /**
     * @inheritDoc
     */
    public function shouldPoll(OS $os, ModuleStatus $status): bool
    {
        return $status->isEnabled();
    }

    /**
     * @inheritDoc
     */
    public function poll(OS $os, DataStorageInterface $datastore): void
    {
        $os->enableGraph('availability');

        $valid_ids = [];
        foreach (UpdiveNSMConfig::get('graphing.availability') as $duration) {
            // update database with current calculation
            $avail = \App\Models\Availability::updateOrCreate([
                'device_id' => $os->getDeviceId(),
                'duration' => $duration,
            ], [
                'availability_perc' => \UpdiveNSM\Device\Availability::availability($os->getDevice(), $duration),
            ]);
            $valid_ids[] = $avail->availability_id;

            // update rrd
            $datastore->put($os->getDeviceArray(), 'availability', [
                'name' => $duration,
                'rrd_def' => RrdDefinition::make()->addDataset('availability', 'GAUGE', 0, 100),
                'rrd_name' => ['availability', $duration],
            ], [
                'availability' => $avail->availability_perc,
            ]);

            // output info
            $human_duration = Time::formatInterval($duration, parts: 1);
            \Log::info(str_pad($human_duration, 7) . ' : ' . $avail->availability_perc . '%');
        }

        // cleanup
        $os->getDevice()->availability()->whereNotIn('availability_id', $valid_ids)->delete();
    }

    public function dataExists(Device $device): bool
    {
        return $device->availability()->exists();
    }

    /**
     * @inheritDoc
     */
    public function cleanup(Device $device): int
    {
        return $device->availability()->delete();
    }

    /**
     * @inheritDoc
     */
    public function dump(Device $device, string $type): ?array
    {
        if ($type == 'discovery') {
            return null;
        }

        return [
            'availability' => $device->availability()->orderBy('duration')
                ->get()->map->makeHidden(['availability_id', 'device_id']),
        ];
    }
}
