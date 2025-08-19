FROM node:18-alpine
WORKDIR /app
COPY server/package.json ./server/
WORKDIR /app/server
RUN npm install
WORKDIR /app
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm install && npm run build
WORKDIR /app/server
COPY server ./server
EXPOSE 3000
CMD ["node", "index.js"]
