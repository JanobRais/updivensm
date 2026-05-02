## Zenduty

Two options are available for ZenDuty support, the first, [native ZenDuty](#native-zenduty)
is via the API Transport as detailed in official [ZenDuty integration documentation](https://docs.zenduty.com/docs/UpdiveNSM).
The other way is by utilising a [native UpdiveNSM transport](#native-UpdiveNSM-transport).

### Native ZenDuty
Leveraging UpdiveNSM > Zenduty Integration, users can send new UpdiveNSM 
alerts to the right team and notify them based on on-call schedules
via email, SMS, Phone Calls, Slack, Microsoft Teams and mobile push
notifications. Zenduty provides engineers with detailed context around 
the UpdiveNSM alert along with playbooks and a complete incident command
framework to triage, remediate and resolve incidents with speed.

Create a [UpdiveNSM Integration](https://docs.zenduty.com/docs/UpdiveNSM) from inside 
[Zenduty](https://www.zenduty.com), then copy the Webhook URL from Zenduty
to UpdiveNSM.

For a detailed guide with screenshots, refer to the 
[UpdiveNSM documentation at Zenduty](https://docs.zenduty.com/docs/UpdiveNSM).

**Example:**

| Config | Example |
| ------ | ------- |
| WebHook URL | <https://www.zenduty.com/api/integration/UpdiveNSM/integration-key/> |

### Native UpdiveNSM Transport
This integration uses the [ZenDuty Webhooks](https://zenduty.com/docs/generic-integration/) 
which allows you to use all available ZenDuty parameters such as URLs, SLA, 
Escalation Policies, etc.

Follow the instructions in the above link to obtain your Webhook URL and then paste that 
into the `ZenDuty WebHook` field when setting up the UpdiveNSM transport.

You can also set the SLA ID and Escalation Policy ID from within the Transport configuration 
which will be sent with all alerts.

This transport will send over the following fields:

`message` - The alert title
`alert_type` - The severity of the alert rule, acknowledged or resolved depending on the state of the alert.
`entity_id` - The alert ID
`urls` - A link back to the device generating the alert.
`summary` - The output of the template associated with the alert rule.

To customise what is sent to ZenDuty and override or add additional fields, you can create 
a custom template which outputs the correct information via JSON. As an example:

```json
{
    "message": "{{ $alert->title }}",
    "payload": {
        "sysName": "{{ $alert->sysName }}",
        "Device Type": "{{ $alert->type }}"
    },
    "summary": "Severity: {{ $alert->severity }}\nTimestamp: {{ $alert->timestamp }}\nRule: {{ $alert->title }}\n @foreach ($alert->faults as $key => $value) {{ $key }}: {{ $value['string'] }}\n @endforeach",
    "sla": "ccaf3fd6-db51-4f9f-818b-de42aee54f29",
    "urls": [
        {
            "link_url": "{{ route('device', ['device' => $alert->device_id ?: 1]) }}",
            "link_text": "{{ $alert->hostname }}"
        },
        {
            "link_url": "{{ route('device', ['device' => $alert->device_id ?? 1, 'tab' => 'alerts']) }}",
            "link_text": "{{ $alert->hostname }} - Alerts"
        }
    ]
}
```
If you are using more than one transport for an alert rule and need to customise the output per 
transport then you can do the following:

```
@if ($alert->transport == 'ZenDuty')
{
  "message": "{{ $alert->title }}",
  "payload": {
    "sysName": "{{ $alert->sysName }}",
    "Device Type": "{{ $alert->type }}"
  },
  "summary": "Severity: {{ $alert->severity }}\nTimestamp: {{ $alert->timestamp }}\nRule: {{ $alert->title }}\n @foreach ($alert->faults as $key => $value) {{ $key }}: {{ $value['string'] }}\n @endforeach",
  "sla": "ccaf3fd6-db51-4f9f-818b-de42aee54f29",
  "urls": [
    {
      "link_url": "{{ route('device', ['device' => $alert->device_id ?: 1]) }}",
      "link_text": "{{ $alert->hostname }}"
    },
    {
      "link_url": "{{ route('device', ['device' => $alert->device_id ?? 1, 'tab' => 'alerts']) }}",
      "link_text": "{{ $alert->hostname }} - Alerts"
    }
  ]
}
@else
{{ $alert->title }}
Severity: {{ $alert->severity }}
@if ($alert->state == 0) Time elapsed: {{ $alert->elapsed }} @endif
Timestamp: {{ $alert->timestamp }}
Unique-ID: {{ $alert->uid }}
Rule: @if ($alert->name) {{ $alert->name }} @else {{ $alert->rule }} @endif
@if ($alert->faults) Faults:
@foreach ($alert->faults as $key => $value)
  {{ $key }}: {{ $value['string'] }}
@endforeach
@endif
Alert sent to:
@foreach ($alert->contacts as $key => $value)
  {{ $value }} <{{ $key }}>
@endforeach
@endif
```

| Config               | Example                                                      |
|----------------------|--------------------------------------------------------------|
| WebHook URL          | <https://events.zenduty.com/integration/we8jv/generic/hash/> |
| SLA ID               | g27u4gr824r-dd32rf2wdedeas-3e2wd223d23                       |
| Escalation Policy ID | KIJDi23rwnef23-dankjd323r-DSAD£2232fds                        |