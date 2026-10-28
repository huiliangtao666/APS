# Build from the repository root so the workspace SDK tarballs are available.
FROM node:22-alpine AS build
WORKDIR /workspace/prototypes/fr006-config-only
COPY .praetor/sdk /workspace/.praetor/sdk
COPY prototypes/fr006-config-only/package.json prototypes/fr006-config-only/package-lock.json ./
RUN npm ci
COPY prototypes/fr006-config-only/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /workspace/prototypes/fr006-config-only
COPY --from=build /workspace/prototypes/fr006-config-only/node_modules ./node_modules
COPY --from=build /workspace/prototypes/fr006-config-only/dist ./dist
COPY --from=build /workspace/prototypes/fr006-config-only/server ./server
COPY --from=build /workspace/prototypes/fr006-config-only/package.json ./package.json
EXPOSE 3000
CMD ["npm", "start"]
