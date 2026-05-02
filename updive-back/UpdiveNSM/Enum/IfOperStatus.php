<?php

namespace UpdiveNSM\Enum;

enum IfOperStatus: string
{
    case Up = 'up';
    case Down = 'down';
    case Testing = 'testing';
    case Unknown = 'unknown';
    case Dormant = 'dormant';
    case NotPresent = 'notPresent';
    case LowerLayerDown = 'lowerLayerDown';
}
