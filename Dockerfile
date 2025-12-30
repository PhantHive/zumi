FROM node:20-slim

WORKDIR /app

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
RUN npm install --production

# Copy built server files
COPY dist/ ./dist/
COPY shared/ ./shared/

# Create necessary directories with correct permissions
RUN mkdir -p /app/uploads/thumbnails /app/data /app/database && \
    chmod -R 775 /app/uploads /app/data /app/database

EXPOSE ${PORT}


CMD ["node", "dist/server/src/server.js"]