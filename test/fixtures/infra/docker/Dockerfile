# syntax=docker/dockerfile:1
FROM node:20.11-alpine AS build
WORKDIR /app
ARG NPM_TOKEN
ENV NODE_ENV=production \
    PORT=8080
RUN npm ci && npm run build
# FROM ubuntu:latest AS never
FROM gcr.io/distroless/nodejs20
COPY --from=build /app /app
EXPOSE 8080
CMD ["server.js"]
