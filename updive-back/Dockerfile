FROM php:8.2-fpm-alpine

# Install system dependencies
RUN apk add --no-cache \
    nginx \
    mariadb-client \
    net-snmp \
    net-snmp-tools \
    rrdtool \
    fping \
    git \
    unzip \
    bash \
    python3 \
    py3-pip \
    libpng-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    libzip-dev \
    icu-dev \
    oniguruma-dev \
    curl-dev \
    linux-headers \
    libxml2-dev \
    sqlite-dev \
    shadow \
    su-exec \
    util-linux

# Install PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        gd \
        bcmath \
        pdo_mysql \
        mysqli \
        sockets \
        mbstring \
        xml \
        curl \
        zip \
        intl

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /opt/updive-nsm

# Copy application files
COPY . .

# Set permissions
RUN chown -R www-data:www-data /opt/updive-nsm \
    && chmod -R 775 /opt/updive-nsm/storage /opt/updive-nsm/bootstrap/cache

# Nginx configuration
COPY docker/nginx.conf /etc/nginx/http.d/default.conf

# Configure Cron for Alpine
COPY docker/updive-nsm.cron /var/spool/cron/crontabs/www-data
RUN chmod 0600 /var/spool/cron/crontabs/www-data && \
    chown www-data:www-data /var/spool/cron/crontabs/www-data

# Entrypoint script
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80

ENTRYPOINT ["entrypoint.sh"]
