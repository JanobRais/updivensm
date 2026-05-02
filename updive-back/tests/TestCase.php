<?php

namespace UpdiveNSM\Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    use SnmpsimHelpers;

    public function dbSetUp()
    {
        if (getenv('DBTEST')) {
            \UpdiveNSM\DB\Eloquent::DB()->beginTransaction();
        } else {
            $this->markTestSkipped('Database tests not enabled.  Set DBTEST=1 to enable.');
        }
    }

    public function dbTearDown()
    {
        if (getenv('DBTEST')) {
            try {
                \UpdiveNSM\DB\Eloquent::DB()->rollBack();
            } catch (\Exception $e) {
                $this->fail("Exception when rolling back transaction.\n" . $e->getTraceAsString());
            }
        }
    }

    protected function tearDown(): void
    {
        $this->beforeApplicationDestroyed(function (): void {
            $this->getConnection()->disconnect();
        });

        parent::tearDown();
    }
}
