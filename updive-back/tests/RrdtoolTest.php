<?php

/**
 * RrdtoolTest.php
 *
 * Tests functionality of our rrdtool wrapper
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
 * @copyright  2016 Tony Murray
 * @author     Tony Murray <murraytony@gmail.com>
 */

namespace UpdiveNSM\Tests;

use App\Facades\UpdiveNSMConfig;
use UpdiveNSM\Data\Store\Rrd;

final class RrdtoolTest extends TestCase
{
    public function testBuildCommandLocal(): void
    {
        UpdiveNSMConfig::set('rrdcached', '');
        UpdiveNSMConfig::set('rrdtool_version', '1.4');
        UpdiveNSMConfig::set('rrd_dir', '/opt/UpdiveNSM/rrd');

        $cmd = $this->buildCommandProxy('create', '/opt/UpdiveNSM/rrd/f', ['o']);
        $this->assertEquals(['create', '/opt/UpdiveNSM/rrd/f', 'o'], $cmd);

        $cmd = $this->buildCommandProxy('tune', '/opt/UpdiveNSM/rrd/f', ['o']);
        $this->assertEquals(['tune', '/opt/UpdiveNSM/rrd/f', 'o'], $cmd);

        $cmd = $this->buildCommandProxy('update', '/opt/UpdiveNSM/rrd/f', ['o']);
        $this->assertEquals(['update', '/opt/UpdiveNSM/rrd/f', 'o'], $cmd);

        UpdiveNSMConfig::set('rrdtool_version', '1.6');

        $cmd = $this->buildCommandProxy('create', '/opt/UpdiveNSM/rrd/f', ['o']);
        $this->assertEquals(['create', '/opt/UpdiveNSM/rrd/f', 'o', '-O'], $cmd);

        $cmd = $this->buildCommandProxy('tune', '/opt/UpdiveNSM/rrd/f', ['o']);
        $this->assertEquals(['tune', '/opt/UpdiveNSM/rrd/f', 'o'], $cmd);

        $cmd = $this->buildCommandProxy('update', '/opt/UpdiveNSM/rrd/f', ['options']);
        $this->assertEquals(['update', '/opt/UpdiveNSM/rrd/f', 'options'], $cmd);
    }

    public function testBuildCommandRemote(): void
    {
        UpdiveNSMConfig::set('rrdcached', 'server:42217');
        UpdiveNSMConfig::set('rrdtool_version', '1.4');
        UpdiveNSMConfig::set('rrd_dir', '/opt/UpdiveNSM/rrd');

        $cmd = $this->buildCommandProxy('create', '/opt/UpdiveNSM/rrd/f', ['o']);
        $this->assertEquals(['create', '/opt/UpdiveNSM/rrd/f', 'o'], $cmd);

        $cmd = $this->buildCommandProxy('tune', '/opt/UpdiveNSM/rrd/f', ['o']);
        $this->assertEquals(['tune', '/opt/UpdiveNSM/rrd/f', 'o'], $cmd);

        $cmd = $this->buildCommandProxy('update', '/opt/UpdiveNSM/rrd/f', ['o']);
        $this->assertEquals(['update', 'f', '--daemon', 'server:42217', 'o'], $cmd);

        UpdiveNSMConfig::set('rrdtool_version', '1.6');

        $cmd = $this->buildCommandProxy('create', '/opt/UpdiveNSM/rrd/f', ['o']);
        $this->assertEquals(['create', 'f', '--daemon', 'server:42217', 'o', '-O'], $cmd);

        $cmd = $this->buildCommandProxy('tune', '/opt/UpdiveNSM/rrd/f', ['o']);
        $this->assertEquals(['tune', 'f', '--daemon', 'server:42217', 'o'], $cmd);

        $cmd = $this->buildCommandProxy('update', '/opt/UpdiveNSM/rrd/f', ['o']);
        $this->assertEquals(['update', 'f', '--daemon', 'server:42217', 'o'], $cmd);
    }

    public function testBuildCommandException(): void
    {
        UpdiveNSMConfig::set('rrdcached', '');
        UpdiveNSMConfig::set('rrdtool_version', '1.4');

        $this->expectException(\UpdiveNSM\Exceptions\FileExistsException::class);
        // use this file, since it is guaranteed to exist
        $this->buildCommandProxy('create', __FILE__, ['o']);
    }

    private function buildCommandProxy(string $command, string $filename, array $options): array
    {
        $mock = $this->mock(Rrd::class)->makePartial(); // avoid constructor
        // @phpstan-ignore method.protected
        $mock->loadConfig(); // load config every time to clear cached settings

        return $mock->buildCommand($command, $filename, $options);
    }
}
