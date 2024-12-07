FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy built server files
COPY dist/ ./dist/
COPY shared/ ./shared/

# Create necessary directories
RUN mkdir -p uploads/thumbnails
RUN mkdir -p data

EXPOSE ${PORT}

CMD ["node", "dist/server/src/server.js"]