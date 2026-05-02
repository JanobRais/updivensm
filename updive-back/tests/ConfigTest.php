<?php

/**
 * ConfigTest.php
 *
 * Tests for App\Facades\Config
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
 * @copyright  2017 Tony Murray
 * @author     Tony Murray <murraytony@gmail.com>
 */

namespace UpdiveNSM\Tests;

use App\ConfigRepository;
use App\Facades\UpdiveNSMConfig;

final class ConfigTest extends TestCase
{
    private \ReflectionProperty $config;

    protected function setUp(): void
    {
        parent::setUp();
        $this->config = new \ReflectionProperty(ConfigRepository::class, 'config');
    }

    public function testGetBasic(): void
    {
        $dir = realpath(__DIR__ . '/..');
        $this->assertEquals($dir, UpdiveNSMConfig::get('install_dir'));
    }

    public function testSetBasic(): void
    {
        $instance = $this->app->make('UpdiveNSM-config');
        UpdiveNSMConfig::set('basics', 'first');
        $this->assertEquals('first', $this->config->getValue($instance)['basics']);
    }

    public function testGet(): void
    {
        $this->setConfig(function (&$config): void {
            $config['one']['two']['three'] = 'easy';
        });

        $this->assertEquals('easy', UpdiveNSMConfig::get('one.two.three'));
    }

    public function testGetDeviceSetting(): void
    {
        $device = ['set' => true, 'null' => null];
        $this->setConfig(function (&$config): void {
            $config['null'] = 'notnull!';
            $config['noprefix'] = true;
            $config['prefix']['global'] = true;
        });

        $this->assertNull(UpdiveNSMConfig::getDeviceSetting($device, 'unset'), 'Non-existing settings should return null');
        $this->assertTrue(UpdiveNSMConfig::getDeviceSetting($device, 'set'), 'Could not get setting from device array');
        $this->assertTrue(UpdiveNSMConfig::getDeviceSetting($device, 'noprefix'), 'Failed to get setting from global config');
        $this->assertEquals(
            'notnull!',
            UpdiveNSMConfig::getDeviceSetting($device, 'null'),
            'Null variables should defer to the global setting'
        );
        $this->assertTrue(
            UpdiveNSMConfig::getDeviceSetting($device, 'global', 'prefix'),
            'Failed to get setting from global config with a prefix'
        );
        $this->assertEquals(
            'default',
            UpdiveNSMConfig::getDeviceSetting($device, 'something', 'else', 'default'),
            'Failed to return the default argument'
        );
    }

    public function testGetOsSetting(): void
    {
        $this->setConfig(function (&$config): void {
            $config['os']['nullos']['fancy'] = true;
            $config['fallback'] = true;
        });

        $this->assertNull(UpdiveNSMConfig::getOsSetting(null, 'unset'), '$os is null, should return null');
        $this->assertNull(UpdiveNSMConfig::getOsSetting('nullos', 'unset'), 'Non-existing settings should return null');
        $this->assertFalse(UpdiveNSMConfig::getOsSetting('nullos', 'unset', false), 'Non-existing settings should return $default');
        $this->assertTrue(UpdiveNSMConfig::getOsSetting('nullos', 'fancy'), 'Failed to get setting');
        $this->assertNull(UpdiveNSMConfig::getOsSetting('nullos', 'fallback'), 'Incorrectly loaded global setting');

        // load yaml
        $this->assertSame('ios', UpdiveNSMConfig::getOsSetting('ios', 'os'));
        $this->assertGreaterThan(500, count(UpdiveNSMConfig::get('os')), 'Not all OS were loaded from yaml');
    }

    public function testGetCombined(): void
    {
        $this->setConfig(function (&$config): void {
            $config['num'] = ['one', 'two'];
            $config['withprefix']['num'] = ['four', 'five'];
            $config['os']['nullos']['num'] = ['two', 'three'];
            $config['assoc'] = ['a' => 'same', 'b' => 'same'];
            $config['withprefix']['assoc'] = ['a' => 'prefix_same', 'd' => 'prefix_same'];
            $config['os']['nullos']['assoc'] = ['b' => 'different', 'c' => 'still same'];
            $config['os']['nullos']['osset'] = 'ossetting';
            $config['gset'] = 'fallbackone';
            $config['withprefix']['gset'] = 'fallbacktwo';
        });

        $this->assertSame(['default'], UpdiveNSMConfig::getCombined('nullos', 'non-existent', '', ['default']), 'Did not return default value on non-existent key');
        $this->assertSame(['ossetting'], UpdiveNSMConfig::getCombined('nullos', 'osset', '', ['default']), 'Did not return OS value when global value is not set');
        $this->assertSame(['fallbackone'], UpdiveNSMConfig::getCombined('nullos', 'gset', '', ['default']), 'Did not return global value when OS value is not set');
        $this->assertSame(['default'], UpdiveNSMConfig::getCombined('nullos', 'non-existent', 'withprefix.', ['default']), 'Did not return default value on non-existent key');
        $this->assertSame(['ossetting'], UpdiveNSMConfig::getCombined('nullos', 'osset', 'withprefix.', ['default']), 'Did not return OS value when global value is not set');
        $this->assertSame(['fallbacktwo'], UpdiveNSMConfig::getCombined('nullos', 'gset', 'withprefix.', ['default']), 'Did not return global value when OS value is not set');

        $combined = UpdiveNSMConfig::getCombined('nullos', 'num');
        sort($combined);
        $this->assertEquals(['one', 'three', 'two'], $combined);

        $combined = UpdiveNSMConfig::getCombined('nullos', 'num', 'withprefix.');
        sort($combined);
        $this->assertEquals(['five', 'four', 'three', 'two'], $combined);

        $this->assertSame(['a' => 'same', 'b' => 'different', 'c' => 'still same'], UpdiveNSMConfig::getCombined('nullos', 'assoc'));
        // should associative not ignore same values (d=>prefix_same)?  are associative arrays actually used?
        $this->assertSame(['a' => 'prefix_same', 'b' => 'different', 'c' => 'still same'], UpdiveNSMConfig::getCombined('nullos', 'assoc', 'withprefix.'));
    }

    public function testSet(): void
    {
        $instance = $this->app->make('UpdiveNSM-config');
        UpdiveNSMConfig::set('you.and.me', "I'll be there");

        $this->assertEquals("I'll be there", $this->config->getValue($instance)['you']['and']['me']);
    }

    public function testSetPersist(): void
    {
        $this->dbSetUp();

        $key = 'testing.persist';

        $query = \App\Models\Config::query()->where('config_name', $key);

        $query->delete();
        $this->assertFalse($query->exists(), "$key should not be set, clean database");
        UpdiveNSMConfig::persist($key, 'one');
        $this->assertEquals('one', $query->value('config_value'));
        UpdiveNSMConfig::persist($key, 'two');
        $this->assertEquals('two', $query->value('config_value'));

        $this->dbTearDown();
    }

    public function testHas(): void
    {
        UpdiveNSMConfig::set('long.key.setting', 'no one cares');
        UpdiveNSMConfig::set('null', null);

        $this->assertFalse(UpdiveNSMConfig::has('null'), 'Keys set to null do not count as existing');
        $this->assertTrue(UpdiveNSMConfig::has('long'), 'Top level key should exist');
        $this->assertTrue(UpdiveNSMConfig::has('long.key.setting'), 'Exact exists on value');
        $this->assertFalse(UpdiveNSMConfig::has('long.key.setting.nothing'), 'Non-existent child setting');

        $this->assertFalse(UpdiveNSMConfig::has('off.the.wall'), 'Non-existent key');
        $this->assertFalse(UpdiveNSMConfig::has('off.the'), 'Config:has() should not modify the config');
    }

    public function testGetNonExistent(): void
    {
        $this->assertNull(UpdiveNSMConfig::get('There.is.no.way.this.is.a.key'));
        $this->assertFalse(UpdiveNSMConfig::has('There.is.no'));  // should not add kes when getting
    }

    public function testGetNonExistentNested(): void
    {
        $this->assertNull(UpdiveNSMConfig::get('cheese.and.bologna'));
    }

    public function testGetSubtree(): void
    {
        UpdiveNSMConfig::set('words.top', 'August');
        UpdiveNSMConfig::set('words.mid', 'And Everything');
        UpdiveNSMConfig::set('words.bot', 'After');
        $expected = [
            'top' => 'August',
            'mid' => 'And Everything',
            'bot' => 'After',
        ];

        $this->assertEquals($expected, UpdiveNSMConfig::get('words'));
    }

    /**
     * Pass an anonymous function which will be passed the config variable to modify before it is set
     *
     * @param  callable  $function
     */
    private function setConfig($function)
    {
        $instance = $this->app->make('UpdiveNSM-config');
        $config = $this->config->getValue($instance);
        $function($config);
        $this->config->setValue($instance, $config);
    }

    public function testForget(): void
    {
        UpdiveNSMConfig::set('forget.me', 'now');
        $this->assertTrue(UpdiveNSMConfig::has('forget.me'));

        UpdiveNSMConfig::forget('forget.me');
        $this->assertFalse(UpdiveNSMConfig::has('forget.me'));
    }

    public function testForgetSubtree(): void
    {
        UpdiveNSMConfig::set('forget.me.sub', 'yep');
        $this->assertTrue(UpdiveNSMConfig::has('forget.me.sub'));

        UpdiveNSMConfig::forget('forget.me');
        $this->assertFalse(UpdiveNSMConfig::has('forget.me.sub'));
    }
}
