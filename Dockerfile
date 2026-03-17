FROM node:24.1.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM node:24.1.0-alpine
RUN apk add --no-cache nginx

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built frontend
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf

# Copy API server + production dependencies only
WORKDIR /app
COPY --from=build /app/server.mjs ./
COPY --from=build /app/copy_library.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Ensure nginx dirs are writable by non-root
RUN chown -R appuser:appgroup /var/lib/nginx /var/log/nginx /run/nginx 2>/dev/null || true
RUN mkdir -p /run/nginx && chown appuser:appgroup /run/nginx

# Ensure app data dir is writable
RUN chown -R appuser:appgroup /app

# Start script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost/api/health || exit 1

EXPOSE 80
USER appuser
CMD ["/start.sh"]
