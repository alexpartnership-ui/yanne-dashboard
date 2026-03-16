#!/bin/sh
# Start Express API server in background
cd /app && node server.mjs &

# Start nginx in foreground
nginx -g 'daemon off;'
