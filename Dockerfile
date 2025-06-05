FROM gcr.io/distroless/nodejs24-debian12:latest
COPY utils.ts rocisc.ts package.json /app
ENV NODE_OPTIONS="--disable-warning=ExperimentalWarning"
CMD ["node", "/app/rocisc.ts"]
