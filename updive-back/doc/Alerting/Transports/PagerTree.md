## PagerTree

The PagerTree transport will POST the alert message to your PagerTree
Incoming WebHook. The only required value is PagerTree webhook integration URL.

The PagerTree transport maps the following fields from UpdiveNSM to PagerTree.  UpdiveNSM alert states are translated to PagerTree event type.

| UpdiveNSM alert state | PagerTree event_type |
| -------------------- | -------------------- |
| 0 (OK) | resolved |
| 1 (Alert) | create |
| 2 (Ack) | acknowledged |


| UpdiveNSM | PagerTree |
| -------- | --------- |
| Alert state | event_type |
| Alert ID | Id |
| Alert title | Title |
| Alert msg | Description |


Webhook is added in PagerTree portal by selecting "Integrations" --> "New Integration" --> "webhooks".  Webhook URL is labeled as "Endpoint" on the new PagerTree Integration summary page.

[PagerTree Docs](https://pagertree.com/docs/integration-guides/webhook). 
[UpdiveNSM Alert Data](https://github.com/UpdiveNSM/UpdiveNSM/blob/master/UpdiveNSM/Alert/AlertData.php).
