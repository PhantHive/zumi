FROM node:20-slim

WORKDIR /app

# Install ffmpeg and yt-dlp (requires python3/pip)
RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip && \
    pip3 install --no-cache-dir --break-system-packages yt-dlp && rm -rf /var/lib/apt/lists/*

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