FROM node:20-slim

WORKDIR /app

# Install packages (removed ffmpeg, removed python3-pip)
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

# Use ensurepip instead of apt package
RUN python3 -m ensurepip --upgrade

# Install yt-dlp
RUN python3 -m pip install --no-cache-dir yt-dlp

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm install

COPY dist/ ./dist/
COPY shared/ ./shared/

# Add Python tools
COPY server/tools/ ./server/tools/
RUN chmod +x ./server/tools/*.py

RUN mkdir -p /app/config
RUN mkdir -p /app/uploads/thumbnails /app/data /app/database && \
    chmod -R 775 /app/uploads /app/data /app/database

EXPOSE ${PORT}

CMD ["node", "dist/server/src/server.js"]