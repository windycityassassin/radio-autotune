FROM node:18-alpine
WORKDIR /app
COPY server.js index.html ./
ENV PORT=7860
EXPOSE 7860
CMD ["node", "server.js"]
