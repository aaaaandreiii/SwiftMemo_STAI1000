FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 7860

CMD ["npm", "run", "dev", "--", "--port", "7860"]
