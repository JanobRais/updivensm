<?php

/**
 * DatastoreTest.php
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
 * @copyright  2018 Tony Murray
 * @author     Tony Murray <murraytony@gmail.com>
 */

namespace UpdiveNSM\Tests\Unit\Data;

use App\Facades\UpdiveNSMConfig;
use UpdiveNSM\Tests\TestCase;
use PHPUnit\Framework\Attributes\Group;

#[Group('datastores')]
final class DatastoreTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        UpdiveNSMConfig::forget([
            'graphite',
            'influxdb',
            'influxdbv2',
            'kafka',
            'opentsdb',
            'prometheus',
            'rrd',
        ]);
    }

    public function testDefaultInitialization(): void
    {
        $ds = $this->app->make('Datastore');
        $stores = $ds->getStores();
        $this->assertCount(1, $stores, 'Incorrect number of default stores enabled');

        $this->assertEquals(\UpdiveNSM\Data\Store\Rrd::class, $stores[0]::class, 'The default enabled store should be Rrd');
    }

    public function testInitialization(): void
    {
        UpdiveNSMConfig::set('rrd.enable', false);
        UpdiveNSMConfig::set('graphite.enable', true);
        UpdiveNSMConfig::set('influxdb.enable', true);
        UpdiveNSMConfig::set('influxdbv2.enable', true);
        UpdiveNSMConfig::set('opentsdb.enable', true);
        UpdiveNSMConfig::set('prometheus.enable', true);
        UpdiveNSMConfig::set('kafka.enable', false);

        $ds = $this->app->make('Datastore');
        $stores = $ds->getStores();
        $this->assertCount(5, $stores, 'Incorrect number of default stores enabled');

        $enabled = array_map(get_class(...), $stores);

        $expected_enabled = [
            \UpdiveNSM\Data\Store\Graphite::class,
            \UpdiveNSM\Data\Store\InfluxDB::class,
            \UpdiveNSM\Data\Store\InfluxDBv2::class,
            \UpdiveNSM\Data\Store\OpenTSDB::class,
            \UpdiveNSM\Data\Store\Prometheus::class,
        ];

        $this->assertEquals($expected_enabled, $enabled, 'Expected all non-default stores to be initialized');
    }
}
