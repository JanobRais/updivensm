<?php

namespace App\Models;

use App\Facades\UpdiveNSMConfig;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;
use UpdiveNSM\Interfaces\Models\Keyable;
use UpdiveNSM\Util\Html;
use UpdiveNSM\Util\Number;
use UpdiveNSM\Util\Rewrite;

class Vminfo extends DeviceRelatedModel implements Keyable
{
    use HasFactory;

    protected $table = 'vminfo';
    public $timestamps = false;
    protected $fillable = [
        'vm_type',
        'vmwVmVMID',
        'vmwVmDisplayName',
        'vmwVmGuestOS',
        'vmwVmMemSize',
        'vmwVmCpus',
        'vmwVmState',
    ];

    public function getStateLabelAttribute(): array
    {
        return Html::powerStateLabel($this->vmwVmState);
    }

    public function getMemoryFormattedAttribute(): string
    {
        return Number::formatBi($this->vmwVmMemSize * 1024 * 1024);
    }

    public function getOperatingSystemAttribute(): string
    {
        if (Str::contains($this->vmwVmGuestOS, 'tools not installed')) {
            return 'Unknown (VMware Tools not installed)';
        } elseif (Str::contains($this->vmwVmGuestOS, 'tools not running')) {
            return 'Unknown (VMware Tools not running)';
        } elseif (empty($this->vmwVmGuestOS)) {
            return '(Unknown)';
        } else {
            return Rewrite::vmwareGuest($this->vmwVmGuestOS);
        }
    }

    public function scopeGuessFromDevice(Builder $query, Device $device): Builder
    {
        $where = [$device->hostname];

        if (UpdiveNSMConfig::get('mydomain')) {
            $where[] = $device->hostname . '.' . UpdiveNSMConfig::get('mydomain');
        }

        return $query->whereIn('vmwVmDisplayName', $where);
    }

    /**
     * @return \Illuminate\Database\Eloquent\Relations\HasOne<\App\Models\Device, $this>
     */
    public function parentDevice(): HasOne
    {
        return $this->hasOne(Device::class, 'hostname', 'vmwVmDisplayName');
    }

    public function getCompositeKey(): string
    {
        return "$this->vm_type-$this->vmwVmVMID";
    }
}
