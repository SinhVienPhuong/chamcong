FROM node:22-bookworm-slim
ENV NODE_ENV=production TZ=Asia/Ho_Chi_Minh DATA_DIR=/data PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
# Chạy bằng root để luôn ghi được vào volume /data dù nền tảng mount với quyền nào
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "app.js"]
