#!/bin/bash

# Wait for database
until mariadb-admin ping -h "$DB_HOST" -u root -p"$MYSQL_ROOT_PASSWORD" --skip-ssl --silent; do
    echo "Waiting for database connection..."
    sleep 2
done

# Ensure permissions
chown -R www-data:www-data /opt/updive-nsm/storage /opt/updive-nsm/bootstrap/cache /opt/updive-nsm/logs /opt/updive-nsm/rrd
chmod -R 775 /opt/updive-nsm/storage /opt/updive-nsm/bootstrap/cache /opt/updive-nsm/logs /opt/updive-nsm/rrd

# Install composer dependencies if not present
if [ ! -d "vendor" ]; then
    su-exec www-data composer install --no-dev --optimize-autoloader
else
    # Refresh autoloader to pick up rebranded namespace changes
    su-exec www-data composer dump-autoload --optimize
fi

# Clear cache and run migrations as www-data
su-exec www-data php artisan optimize:clear
su-exec www-data php artisan migrate --force

# Start Nginx
nginx

# Start PHP-FPM
php-fpm
