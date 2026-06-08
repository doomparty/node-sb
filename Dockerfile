FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends gnupg bash procps && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --only=production --ignore-scripts
COPY . .
EXPOSE 5000
CMD ["node", "app.js"]
