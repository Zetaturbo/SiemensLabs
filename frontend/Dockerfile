# Frontend image. Build from the REPO ROOT, because the app reads ../data at run time:
#   docker build -f frontend/Dockerfile -t siemenslabs-frontend .
# Run (keys come from the environment, never from the image):
#   docker run --rm -p 3000:3000 --env-file frontend/.env siemenslabs-frontend
#
# Not using output: "standalone": route handlers read files from process.cwd() at run time
# (src/lib/data-api/mocks, evals/*.json, public/models, ../data/*.csv), which standalone would drop.

FROM node:22-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app/frontend

# Dependencies first, so source edits do not reinstall them.
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY data /app/data
COPY frontend ./
# NEXT_PUBLIC_* values are baked into the browser bundle here. Never pass a secret this way.
ARG NEXT_PUBLIC_CHAT_DEMO
RUN pnpm build


FROM node:22-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
WORKDIR /app/frontend
COPY --from=build --chown=node:node /app/data /app/data
COPY --from=build --chown=node:node /app/frontend ./
USER node
EXPOSE 3000
# Cloud Run sets PORT; next start reads it.
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0"]
