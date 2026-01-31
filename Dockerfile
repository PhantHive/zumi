FROM node:20-slim

WORKDIR /app

# Install system packages (NO pip needed!)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    wget \
    chromium \
    python3 \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpangocairo-1.0-0 \
    libxss1 \
    libasound2 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# yt-dlp removed from image build (YouTube functionality disabled)

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Copy package files
COPY package*.json ./
RUN npm install

# Copy built server files
COPY dist/ ./dist/
COPY shared/ ./shared/

# Python tools directory removed (YouTube-related tools disabled)

# Create config directory (will be mounted at runtime)
RUN mkdir -p /app/config

# Create necessary directories with correct permissions
RUN mkdir -p /app/uploads/thumbnails /app/data /app/database && \
    chmod -R 775 /app/uploads /app/data /app/database

EXPOSE ${PORT}

CMD ["node", "dist/server/src/server.js"]