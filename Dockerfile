FROM node:20-alpine

RUN apk add --no-cache gnupg bash 

WORKDIR /app
COPY package*.json ./
RUN npm install --only=production --ignore-scripts
COPY . .

EXPOSE 5000 

CMD ["node", "app.js"]
