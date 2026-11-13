FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html env.d.ts tsconfig*.json vite.config.ts ./
COPY public/ ./public/
COPY src/ ./src/

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
RUN test -n "$VITE_SUPABASE_URL" || { echo 'Falta VITE_SUPABASE_URL.' >&2; exit 1; }
RUN case "$VITE_SUPABASE_PUBLISHABLE_KEY" in \
      sb_publishable_?*) ;; \
      *) echo 'Usá la clave publicable de Supabase (sb_publishable_…).' >&2; exit 1 ;; \
    esac && npm run build

FROM nginx:1.30.6-alpine-slim
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/recetapis/
RUN nginx -t
