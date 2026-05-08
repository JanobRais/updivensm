#!/bin/bash

# Wait for database
echo "Waiting for database connection..."
/usr/local/bin/php -r '
$max = 30;
while ($max--) {
    try {
        new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_DATABASE"), getenv("DB_USERNAME"), getenv("DB_PASSWORD"));
        exit(0);
    } catch (Exception $e) {
        sleep(2);
    }
}
exit(1);
'
echo "Database is ready."

# Register custom MIBs (eltex and any other vendor mibs in /opt/updive-nsm/mibs/)
if [ -d /opt/updive-nsm/mibs ]; then
    MIB_CONF=/etc/snmp/snmp.conf
    mkdir -p /etc/snmp
    # Remove old auto-generated lines to avoid duplicates on restart
    grep -v "# updive-mibs" "$MIB_CONF" > /tmp/snmp.conf.tmp 2>/dev/null && mv /tmp/snmp.conf.tmp "$MIB_CONF" || true
    for dir in /opt/updive-nsm/mibs/*/; do
        [ -d "$dir" ] && echo "mibdirs +$dir  # updive-mibs" >> "$MIB_CONF"
    done
    echo "mibs +ALL  # updive-mibs" >> "$MIB_CONF"
    echo "Custom MIBs registered from /opt/updive-nsm/mibs/"
fi

# Ensure permissions
chown -R www-data:www-data /opt/updive-nsm/storage /opt/updive-nsm/bootstrap/cache /opt/updive-nsm/logs /opt/updive-nsm/rrd
chmod -R 775 /opt/updive-nsm/storage /opt/updive-nsm/bootstrap/cache /opt/updive-nsm/logs /opt/updive-nsm/rrd

# Install composer dependencies if not present
if [ ! -d "vendor" ]; then
    su-exec www-data composer install --no-dev --optimize-autoloader
else
    su-exec www-data composer dump-autoload --optimize
fi

# Ensure UpdiveNSM user env vars are set (CommandStartingListener checks these)
export UpdiveNSM_USER=${UpdiveNSM_USER:-www-data}
export UpdiveNSM_GROUP=${UpdiveNSM_GROUP:-www-data}

# Clear cache and run migrations
su-exec www-data /usr/local/bin/php /opt/updive-nsm/artisan optimize:clear
su-exec www-data /usr/local/bin/php /opt/updive-nsm/artisan migrate --force
su-exec www-data /usr/local/bin/php /opt/updive-nsm/artisan db:seed --class=DeviceTemplatesSeeder --force || echo "[entrypoint] Seeder warning (non-fatal)"

# Always use the latest nginx config from the mounted volume
if [ -f /opt/updive-nsm/docker/nginx.conf ]; then
    cp /opt/updive-nsm/docker/nginx.conf /etc/nginx/http.d/default.conf
fi

# Start Supervisor (which starts nginx, php-fpm, crond, and scheduler)
exec /usr/bin/supervisord -c /etc/supervisord.conf
