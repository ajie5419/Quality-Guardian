FROM node:22-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm i -g corepack && corepack enable

WORKDIR /app

COPY . .

# Install dependencies and build the frontend
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install
RUN pnpm run build --filter=@vben/web-antd

# Production stage
FROM nginx:stable-alpine AS production

# Copy custom nginx config
COPY ./apps/web-antd/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files
COPY --from=builder /app/apps/web-antd/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
