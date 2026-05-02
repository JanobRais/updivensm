<?php

namespace UpdiveNSM\Interfaces\Discovery;

use Illuminate\Support\Collection;

interface Ipv6NdDiscovery
{
    /**
     * @return Collection<\App\Models\Ipv6Nd>
     */
    public function discoverIpv6Neighbor(): Collection;
}
