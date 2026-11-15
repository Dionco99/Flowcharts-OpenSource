FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci && npm run build -w @flowchart/desk && chown -R node:node /app

ENV NODE_ENV=production
EXPOSE 5173

USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:5173/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["npm", "run", "preview", "-w", "@flowchart/desk"]
