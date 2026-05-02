<?php

namespace App\View\Components;

use App\Facades\UpdiveNSMConfig;
use Illuminate\View\Component;

class Popup extends Component
{
    /**
     * Get the view / contents that represent the component.
     *
     * @return \Illuminate\Contracts\View\View|\Closure|string
     */
    public function render()
    {
        return UpdiveNSMConfig::get('web_mouseover', true)
            ? view('components.popup')
            : view('components.nopopup');
    }
}
