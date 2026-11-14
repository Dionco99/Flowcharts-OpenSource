FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node package.json build.mjs ./
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src

RUN node build.mjs && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080

USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "src/server.mjs"]
