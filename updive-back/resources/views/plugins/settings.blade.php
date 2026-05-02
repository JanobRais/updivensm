@extends('layouts.UpdiveNSMv1')

@section('title', $title)

@section('content')
    @include($content_view, $settings)
@endsection
