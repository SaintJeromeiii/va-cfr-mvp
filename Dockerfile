FROM node:20-alpine

WORKDIR /usr/src/app

# install only runtime dependencies
COPY package*.json ./
RUN npm install --omit=dev

# copy app sources (including data files)
COPY . .

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
