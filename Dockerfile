FROM node:20-slim

WORKDIR /app

# Install ffmpeg, yt-dlp binary and required libs for Puppeteer/Chromium
RUN apt-get update && apt-get install -y \
    ffmpeg \
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
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxfixes3 \
    libxrender1 \
    --no-install-recommends && \
    curl -L -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Copy package files
COPY package*.json ./
RUN npm install

# Copy built server files
COPY dist/ ./dist/
COPY shared/ ./shared/

# Create config directory (will be mounted at runtime)
RUN mkdir -p /app/config

# Create necessary directories with correct permissions
RUN mkdir -p /app/uploads/thumbnails /app/data /app/database && \
    chmod -R 775 /app/uploads /app/data /app/database

EXPOSE ${PORT}

CMD ["node", "dist/server/src/server.js"]