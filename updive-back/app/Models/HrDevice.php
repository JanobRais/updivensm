<?php

namespace App\Models;

use UpdiveNSM\Interfaces\Models\Keyable;

class HrDevice extends DeviceRelatedModel implements Keyable
{
    public $timestamps = false;
    protected $table = 'hrDevice';
    protected $primaryKey = 'hrDevice_id';
    protected $fillable = [
        'hrDeviceIndex',
        'hrDeviceDescr',
        'hrDeviceType',
        'hrDeviceErrors',
        'hrDeviceStatus',
        'hrProcessorLoad',
    ];

    public function getCompositeKey(): int
    {
        return (int) $this->hrDeviceIndex;
    }
}
