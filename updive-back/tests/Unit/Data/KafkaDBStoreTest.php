<?php

namespace UpdiveNSM\Tests\Unit\Data;

use App\Facades\UpdiveNSMConfig;
use UpdiveNSM\Data\Store\Kafka;
use UpdiveNSM\Tests\TestCase;
use PHPUnit\Framework\Attributes\Group;

#[Group('external-dependencies')]
final class KafkaDBStoreTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        UpdiveNSMConfig::set('kafka.enable', true);
        UpdiveNSMConfig::set('kafka.broker.list', 'localhost:9092');
        UpdiveNSMConfig::set('kafka.topic', 'UpdiveNSM');
        UpdiveNSMConfig::set('kafka.idempotence', false);
        UpdiveNSMConfig::set('kafka.buffer.max.message', 10);
        UpdiveNSMConfig::set('kafka.batch.max.message', 25);
        UpdiveNSMConfig::set('kafka.linger.ms', 5000);
        UpdiveNSMConfig::set('kafka.request.required.acks', 0);
    }

    public function testDataPushToKafka(): void
    {
        $producer = \Mockery::mock(Kafka::getClient());
        $producer->shouldReceive('newTopic')->once();

        /** @var \RdKafka\Producer $producer */
        $producer = $producer;
        $kafka = new Kafka($producer);

        $device = ['device_id' => 1, 'hostname' => 'testhost'];
        $measurement = 'excluded_measurement';
        $tags = ['ifName' => 'testifname', 'type' => 'testtype'];
        $fields = ['ifIn' => 234234, 'ifOut' => 53453];

        $metadata = [
            'device' => $device,
        ];
        $kafka->write($measurement, $fields, $tags, $metadata);
    }

    protected function tearDown(): void
    {
        UpdiveNSMConfig::set('kafka.enable', false);
        parent::tearDown();
    }
}
