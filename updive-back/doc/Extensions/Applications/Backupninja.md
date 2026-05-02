## backupninja

A small shell script that reports status of last backupninja backup.

### SNMP Extend

1. Download the [backupninja
script](https://github.com/UpdiveNSM/UpdiveNSM-agent/blob/master/snmp/backupninja.py)
to `/etc/snmp/backupninja.py` on your backuped server.

```bash
wget https://raw.githubusercontent.com/UpdiveNSM/UpdiveNSM-agent/master/snmp/backupninja.py -O /etc/snmp/backupninja.py`
```

2. Make the script executable:

```bash
chmod +x /etc/snmp/backupninja.py
```

3. Edit your snmpd.conf file (usually `/etc/snmp/snmpd.conf`) and add:

```bash
extend backupninja /etc/snmp/backupninja.py
```

4. Restart snmpd on your host