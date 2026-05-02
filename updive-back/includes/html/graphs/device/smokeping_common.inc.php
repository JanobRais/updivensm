<?php

$smokeping = new \UpdiveNSM\Util\Smokeping(DeviceCache::getPrimary());
$smokeping_files = $smokeping->findFiles();
