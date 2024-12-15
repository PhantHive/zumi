FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy built server files
COPY dist/ ./dist/
COPY shared/ ./shared/

# Create necessary directories with correct permissions
RUN mkdir -p /app/uploads/thumbnails /app/data && \
    chmod -R 775 /app/uploads /app/data

EXPOSE ${PORT}

CMD if [ -z "$PORT" ] || [ -z "$MONGODB_URI" ]; then \
    echo "Error: Required environment variables are not set"; \
    exit 1; \
    else \
    node dist/server/src/server.js; \
    fi

CMD ["node", "dist/server/src/server.js"]