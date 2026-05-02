@php
    $base_uri = $request->url();
    $raw_query = $request->query->all();
    $clean_query = [];
    foreach ($raw_query as $k => $v) {
        if (is_string($v)) {
            $clean_query[$k] = $v;
        }
    }

    $str_index_url = $base_uri . '?' . http_build_query(array_merge($clean_query, [
        'sort' => 'index', 
        'order' => (($data['sort'] ?? '') !== 'index') ? 'asc' : ($data['next_order'] ?? 'asc')
    ]));
    
    $str_port_url = $base_uri . '?' . http_build_query(array_merge($clean_query, [
        'sort' => 'port', 
        'order' => (($data['sort'] ?? '') == 'port') ? ($data['next_order'] ?? 'asc') : 'asc'
    ]));
    
    $str_traffic_url = $base_uri . '?' . http_build_query(array_merge($clean_query, [
        'sort' => 'traffic', 
        'order' => (($data['sort'] ?? '') == 'traffic') ? ($data['next_order'] ?? 'desc') : 'desc'
    ]));
    
    $str_speed_url = $base_uri . '?' . http_build_query(array_merge($clean_query, [
        'sort' => 'speed', 
        'order' => (($data['sort'] ?? '') == 'speed') ? ($data['next_order'] ?? 'desc') : 'desc'
    ]));
    
    $str_media_url = $base_uri . '?' . http_build_query(array_merge($clean_query, [
        'sort' => 'media', 
        'order' => (($data['sort'] ?? '') == 'media') ? ($data['next_order'] ?? 'asc') : 'asc'
    ]));
    
    $str_mac_url = $base_uri . '?' . http_build_query(array_merge($clean_query, [
        'sort' => 'mac', 
        'order' => (($data['sort'] ?? '') == 'mac') ? ($data['next_order'] ?? 'asc') : 'asc'
    ]));
@endphp

<div class="row" style="margin-bottom: 15px;">
    <div class="col-md-12">
        <form method="GET" action="{{ (string)$base_uri }}" class="form-inline">
            @foreach($request->except(['searchPort', 'page']) as $key => $value)
                @if(is_string($value))
                    <input type="hidden" name="{{ (string)$key }}" value="{{ (string)$value }}">
                @endif
            @endforeach
            <div class="form-group" style="margin-right: 10px;">
                <input type="text" class="form-control" id="searchPort" name="searchPort" 
                       value="{{ (string)$request->input('searchPort', '') }}" placeholder="search ..." style="width: 250px;">
            </div>
            <button type="submit" class="btn btn-primary btn-sm"><i class="fa fa-search"></i> Filter</button>
            @if($request->input('searchPort'))
                @php
                    $clear_params = $request->except(['searchPort', 'page']);
                    $safe_clear_params = array_filter($clear_params, 'is_string');
                @endphp
                <a href="{{ $base_uri }}?{{ http_build_query($safe_clear_params) }}" 
                   class="btn btn-default btn-sm" style="margin-left: 5px;"><i class="fa fa-times"></i> Clear</a>
            @endif
        </form>
    </div>
</div>

<x-panel body-class="tw:p-0!">
    <table id="ports-fdb" class="table table-condensed table-hover table-striped tw:mt-1 tw:mb-0!">
        <thead>
        <tr>
            <th width="50"><a href="{{ (string)$str_index_url }}">{{ __('Index') }}</a></th>
            <th width="350"><a href="{{ (string)$str_port_url }}">{{ __('Port') }}</a></th>
            <th width="100" class="tw:hidden tw:md:table-cell">{{ __('Port Groups') }}</th>
            <th width="100">{{ __('Graphs') }}</th>
            <th width="120"><a href="{{ (string)$str_traffic_url }}">{{ __('Traffic') }}</a></th>
            <th width="75"><a href="{{ (string)$str_speed_url }}">{{ __('Speed') }}</a></th>
            <th width="100" class="tw:hidden tw:sm:table-cell"><a href="{{ (string)$str_media_url }}">{{ __('Media') }}</a></th>
            <th width="100"><a href="{{ (string)$str_mac_url }}">{{ __('MAC Address') }}</a></th>
            <th width="375" class="tw:hidden tw:md:table-cell"></th>
        </tr>
        </thead>
        <tbody>
        @foreach(($data['ports'] ?? []) as $port)
            @include('device.tabs.ports.includes.port_row', ['collapsing' => true])
        @endforeach
        </tbody>
    </table>
    <div class="tw:flex tw:flex-row-reverse tw:m-3">
        @if(isset($data['ports']) && method_exists($data['ports'], 'links'))
            {{ $data['ports']->links('pagination::tailwind', ['perPage' => ($data['perPage'] ?? 32)]) }}
        @endif
        @isset($data['perPage'])
            <x-select :options="['16', '32', '128', 'all']"
                      x-on:change="
                      const params = new URLSearchParams(window.location.search);
                      params.set('perPage', $event.target.value);
                      params.delete('page');
                      window.location.search = params.toString();
                      " x-data="{}"
                      selected="{{ (string)($data['perPage'] ?? '32') }}"
                      name="perPage"
                      label="{{ __('Per Page') }}"
                      class="tw:mx-4"></x-select>
        @endisset
    </div>
</x-panel>
