<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 9px; color: #1f2937; background: #fff; }
  .header { background: #1e293b; color: #fff; padding: 14px 20px; margin-bottom: 16px; }
  .header h1 { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .header .meta { font-size: 9px; color: #94a3b8; }
  .summary { display: flex; gap: 12px; padding: 0 20px 12px; }
  .summary .stat { background: #f1f5f9; border-radius: 6px; padding: 8px 14px; }
  .summary .stat .val { font-size: 18px; font-weight: 700; color: #0f172a; }
  .summary .stat .lbl { font-size: 8px; color: #64748b; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 0 20px; width: calc(100% - 40px); }
  thead tr { background: #334155; color: #f8fafc; }
  thead th { padding: 7px 10px; text-align: left; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody tr:nth-child(odd)  { background: #fff; }
  tbody td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 8.5px; }
  .status-up   { color: #16a34a; font-weight: 700; }
  .status-down { color: #dc2626; font-weight: 700; }
  .status-fired   { color: #dc2626; font-weight: 700; }
  .status-cleared { color: #16a34a; }
  .status-ack     { color: #d97706; }
  .footer { margin-top: 14px; padding: 8px 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 8px; display: flex; justify-content: space-between; }
  .no-data { text-align: center; padding: 40px; color: #94a3b8; font-size: 13px; }
</style>
</head>
<body>
<div class="header">
  <h1>UpdiveNSM — {{ $title }}</h1>
  <div class="meta">Hisobot sanasi: {{ now()->format('d.m.Y H:i') }} &nbsp;·&nbsp; Jami: {{ count($data) }} yozuv</div>
</div>

@if(empty($data))
  <div class="no-data">Ma'lumot topilmadi</div>
@else
<table>
  <thead>
    <tr>
      @foreach($headers as $h)
        <th>{{ $h }}</th>
      @endforeach
    </tr>
  </thead>
  <tbody>
    @foreach($data as $row)
    <tr>
      @foreach($row as $key => $val)
        @php
          $cls = '';
          if ($key === 'Holat') {
            if ($val === 'UP' || $val === 'Cleared') $cls = 'status-up';
            elseif ($val === 'DOWN' || $val === 'Fired') $cls = 'status-down';
            elseif ($val === 'ACK') $cls = 'status-ack';
          }
        @endphp
        <td @if($cls) class="{{ $cls }}" @endif>{{ $val }}</td>
      @endforeach
    </tr>
    @endforeach
  </tbody>
</table>
@endif

<div class="footer">
  <span>UpdiveNSM Monitoring System</span>
  <span>{{ now()->format('Y-m-d H:i:s') }}</span>
</div>
</body>
</html>
