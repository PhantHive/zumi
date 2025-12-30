FROM node:20-slim

WORKDIR /app

# Install ffmpeg and download yt-dlp static binary (avoid pip/PEP668 issues)
RUN apt-get update && apt-get install -y ffmpeg ca-certificates curl && \
    curl -L -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
RUN npm install

# Copy built server files
COPY dist/ ./dist/
COPY shared/ ./shared/

# Create necessary directories with correct permissions
RUN mkdir -p /app/uploads/thumbnails /app/data /app/database && \
    chmod -R 775 /app/uploads /app/data /app/database

EXPOSE ${PORT}


CMD ["node", "dist/server/src/server.js"]