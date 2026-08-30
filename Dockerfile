# IMG CRM — production image.
# Node 24 (the app uses the built-in node:sqlite module, which needs Node 22.5+).
FROM node:24-alpine

WORKDIR /app

# Install production dependencies only (nodemon is dev-only).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source. The database and uploads live on mounted volumes (see
# docker-compose.yml), NOT baked into the image, so they persist across rebuilds.
COPY . .

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "start"]
