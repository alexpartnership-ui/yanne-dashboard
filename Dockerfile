FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM node:24-alpine
RUN apk add --no-cache nginx

# Copy built frontend
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf

# Copy API server + node_modules
WORKDIR /app
COPY --from=build /app/server.mjs ./
COPY --from=build /app/copy_library.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Start script: run both nginx and API server
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 80
CMD ["/start.sh"]
