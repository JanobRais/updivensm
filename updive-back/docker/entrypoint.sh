#!/bin/bash

# Wait for database (PHP-based to avoid Alpine segmentation fault)
echo "Waiting for database connection..."
php -r '
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

# Start crond for periodic polling
crond -b

# Start Nginx
nginx

# Start PHP-FPM
php-fpm
