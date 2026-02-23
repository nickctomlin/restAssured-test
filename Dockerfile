FROM node:18-slim

COPY package.json /package.json
RUN cd / && npm install --omit=dev

COPY scripts/ /scripts/
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
