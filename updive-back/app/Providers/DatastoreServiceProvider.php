<?php

/**
 * DatastoreServiceProvider.php
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

namespace App\Providers;

use Illuminate\Contracts\Foundation\Application;
use Illuminate\Support\ServiceProvider;
use UpdiveNSM\Data\Store\Datastore;
use UpdiveNSM\Interfaces\Data\Datastore as DatastoreContract;

class DatastoreServiceProvider extends ServiceProvider
{
    protected $namespace = 'UpdiveNSM\\Data\\Store\\';
    protected $stores = [
        \UpdiveNSM\Data\Store\Graphite::class,
        \UpdiveNSM\Data\Store\InfluxDB::class,
        \UpdiveNSM\Data\Store\InfluxDBv2::class,
        \UpdiveNSM\Data\Store\OpenTSDB::class,
        \UpdiveNSM\Data\Store\Prometheus::class,
        \UpdiveNSM\Data\Store\Rrd::class,
        \UpdiveNSM\Data\Store\Kafka::class,
    ];

    public function register(): void
    {
        // set up bindings
        foreach ($this->stores as $store) {
            $this->app->singleton($store);
        }

        // bind the Datastore object
        $this->app->singleton('Datastore', function (Application $app, $options) {
            // only tag datastores enabled by config
            $stores = array_filter($this->stores, function ($store) {
                /** @var DatastoreContract $store */
                return $store::isEnabled();
            });

            $app->tag($stores, ['datastore']);

            return new Datastore(iterator_to_array($app->tagged('datastore')));
        });

        // additional bindings
        $this->registerInflux();
        $this->registerKafka();
    }

    public function registerInflux()
    {
        $this->app->singleton(\InfluxDB\Database::class, fn ($app) => \UpdiveNSM\Data\Store\InfluxDB::createFromConfig());
    }

    public function registerKafka()
    {
        $this->app->singleton(\RdKafka\Producer::class, fn ($app) => \UpdiveNSM\Data\Store\Kafka::getClient());
    }
}
