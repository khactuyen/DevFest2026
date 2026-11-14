FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY scripts ./scripts
RUN npm ci
COPY . .
RUN npm run build
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir data && chown node:node data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
