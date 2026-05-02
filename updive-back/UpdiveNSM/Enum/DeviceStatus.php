<?php

namespace UpdiveNSM\Enum;

enum DeviceStatus
{
    case Disabled;
    case Down;
    case IgnoredDown;
    case IgnoredUp;
    case NeverPolled;
    case Up;
}
