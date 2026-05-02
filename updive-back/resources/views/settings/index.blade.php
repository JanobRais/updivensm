@extends('layouts.UpdiveNSMv1')

@section('title', __('settings.title'))

@section('content')
    <div class="container-fluid">
        <div id="app">
            <UpdiveNSM-settings
                prefix="{{ url('settings') }}"
                initial-tab="{{ $active_tab }}"
                initial-section="{{ $active_section }}"
                :tabs="{{ $groups }}"
            ></UpdiveNSM-settings>
        </div>
    </div>
@endsection

@push('scripts')
    @routes
    @vuei18n
@endpush
