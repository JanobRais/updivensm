<?php

namespace App\Http\Controllers;

use App\Checks;
use App\Facades\UpdiveNSMConfig;
use Illuminate\Contracts\Session\Session;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use UpdiveNSM\Util\Debug;

class LegacyController extends Controller
{
    public function index(Request $request, Session $session)
    {
        Checks::postAuth();

        // Set variables
        $no_refresh = false; // may be overridden by included pages
        $init_modules = ['web', 'auth'];
        require base_path('/includes/init.php');

        Debug::set(Str::contains($request->path(), 'debug'));

        ob_start(); // protect against bad plugins that output during start
        \UpdiveNSM\Plugins::start();
        ob_end_clean();

        if (Str::contains($request->path(), 'widescreen=yes')) {
            $session->put('widescreen', 1);
        }
        if (Str::contains($request->path(), 'widescreen=no')) {
            $session->forget('widescreen');
        }

        // Load the settings for Multi-Tenancy.
        if (UpdiveNSMConfig::has('branding') && is_array(UpdiveNSMConfig::get('branding'))) {
            $branding = Arr::dot(UpdiveNSMConfig::get('branding.' . $request->server('SERVER_NAME'), UpdiveNSMConfig::get('branding.default')));
            foreach ($branding as $key => $value) {
                UpdiveNSMConfig::set($key, $value);
            }
        }

        // page_title_prefix is displayed, unless page_title is set FIXME: NEEDED?
        if (UpdiveNSMConfig::has('page_title')) {
            UpdiveNSMConfig::set('page_title_prefix', UpdiveNSMConfig::get('page_title'));
        }

        // render page
        ob_start();
        $vars['page'] = basename($vars['page'] ?? '');
        if ($vars['page'] && is_file('includes/html/pages/' . $vars['page'] . '.inc.php')) {
            require 'includes/html/pages/' . $vars['page'] . '.inc.php';
        } else {
            abort(404);
        }

        $html = ob_get_clean();

        if (isset($pagetitle) && is_array($pagetitle)) {
            // if prefix is set, put it in front
            if (UpdiveNSMConfig::get('page_title_prefix')) {
                array_unshift($pagetitle, UpdiveNSMConfig::get('page_title_prefix'));
            }

            // if suffix is set, put it in the back
            if (UpdiveNSMConfig::get('page_title_suffix')) {
                $pagetitle[] = UpdiveNSMConfig::get('page_title_suffix');
            }

            // create and set the title
            $title = implode(' - ', $pagetitle);
            $html .= "<script type=\"text/javascript\">\ndocument.title = '$title';\n</script>";
        }

        return response()->view('layouts.legacy_page', [
            'content' => $html,
            'refresh' => $no_refresh ? 0 : UpdiveNSMConfig::get('page_refresh'), // @phpstan-ignore ternary.alwaysFalse ($no_refresh may be set by included pages)
        ]);
    }

    public function dummy()
    {
        return 'Dummy page';
    }
}
