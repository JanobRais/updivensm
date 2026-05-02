<?php

use UpdiveNSM\Device\Processor;
use UpdiveNSM\OS;

Processor::poll(OS::make($device));
