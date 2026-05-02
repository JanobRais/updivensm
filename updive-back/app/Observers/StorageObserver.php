<?php

namespace App\Observers;

use App\Facades\UpdiveNSMConfig;
use App\Models\Storage;

class StorageObserver
{
    public function creating(Storage $storage): void
    {
        if ($storage->storage_perc_warn === null) {
            $storage->storage_perc_warn = UpdiveNSMConfig::get('storage_perc_warn');
        }
    }
}
