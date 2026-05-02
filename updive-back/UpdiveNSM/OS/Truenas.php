<?php

namespace UpdiveNSM\OS;

use Illuminate\Support\Collection;
use UpdiveNSM\OS;

class Truenas extends OS
{
    public function discoverStorage(): Collection
    {
        // discover both yaml and HR storage
        return $this->discoverYamlStorage()->merge($this->discoverHrStorage());
    }
}
