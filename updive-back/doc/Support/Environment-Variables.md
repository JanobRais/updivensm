# Environment Variables

UpdiveNSM allows certain settings to be set via the environment or
through the .env file.

## Database

Set the variables to connect to the database.  The default values are shown below.

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=UpdiveNSM
DB_USERNAME=UpdiveNSM
DB_PASSWORD=
DB_SOCKET=
```

## Trusted Reverse Proxies

A comma separated list of trusted reverse proxy IPs or CIDR.

For legacy reasons the default is `'*'`, which means any proxy is allowed.
`'**'` means trust any proxy up the chain.

```dotenv
APP_TRUSTED_PROXIES=192.168.1.0/24,192.167.8.20
```

## Base url

Set the base url for generated urls.

This will be needed when using signed graph urls for alerting. It may
be needed when using reverse proxies combined with a subdirectory.

Generally, UpdiveNSM will make correct URLs (especially if you have set
up your proxy variables correctly)

```dotenv
APP_URL=http://UpdiveNSM/
```

## User / Group

The user and group that UpdiveNSM should operate as.
Group will default to the same as the user if unset.

```dotenv
UpdiveNSM_USER=UpdiveNSM
UpdiveNSM_GROUP=UpdiveNSM
```

## Debug

Increases the amount of information shown when an error occurs.

> WARNING: This may leak information, do not leave enabled.

```dotenv
APP_DEBUG=true
```
