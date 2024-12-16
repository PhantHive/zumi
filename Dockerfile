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

# Add a healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "try { require('http').get('http://localhost:' + process.env.PORT + '/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)); } catch (e) { process.exit(1); }"

# Validate environment variables and start application
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/server/src/server.js"]