FROM node:20-alpine
WORKDIR /repo

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3001
CMD ["node", "dist/server.js"]
