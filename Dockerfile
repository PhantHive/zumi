FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy built server files
COPY dist/ ./dist/
COPY shared/ ./shared/

# Create necessary directories
RUN mkdir -p public/uploads/thumbnails
RUN mkdir -p public/data

EXPOSE ${PORT}

CMD ["node", "dist/server/src/server.js"]