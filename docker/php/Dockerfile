FROM php:8.2-cli-alpine

# System deps + PHP extensions
RUN apk add --no-cache \
    bash \
    git \
    curl \
    libzip-dev \
    libpq-dev \
    libpng-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    icu-dev \
    oniguruma-dev \
    autoconf \
    g++ \
    make \
    linux-headers \
    poppler-utils \
    imagemagick \
    ghostscript \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        pdo \
        pdo_pgsql \
        pgsql \
        bcmath \
        mbstring \
        zip \
        gd \
        intl \
        opcache \
        pcntl \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del autoconf g++ make linux-headers

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# PHP config
RUN { \
        echo 'memory_limit = 512M'; \
        echo 'upload_max_filesize = 100M'; \
        echo 'post_max_size = 100M'; \
        echo 'max_execution_time = 300'; \
        echo 'date.timezone = UTC'; \
    } > /usr/local/etc/php/conf.d/fai.ini

WORKDIR /var/www/html

# Default — overridden by docker-compose command
CMD ["php", "-S", "0.0.0.0:8000", "-t", "public"]
