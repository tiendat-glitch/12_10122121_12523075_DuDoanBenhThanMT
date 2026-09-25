FROM nginx:1.28-alpine
COPY index.html app.js style.css /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY 15-health.sh /docker-entrypoint.d/15-health.sh
RUN chmod +x /docker-entrypoint.d/15-health.sh
CMD ["nginx", "-g", "daemon off;"]
