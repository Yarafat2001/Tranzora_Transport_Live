# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS deps
WORKDIR /src
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS web-build
COPY . .
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api-build
WORKDIR /src
COPY backend/Directory.Build.props ./
COPY backend/Tranzora.Api/Tranzora.Api.csproj Tranzora.Api/
COPY backend/Tranzora.Application/Tranzora.Application.csproj Tranzora.Application/
COPY backend/Tranzora.Infrastructure/Tranzora.Infrastructure.csproj Tranzora.Infrastructure/
COPY backend/Tranzora.Domain/Tranzora.Domain.csproj Tranzora.Domain/
RUN dotnet restore Tranzora.Api/Tranzora.Api.csproj
COPY backend/ ./
RUN dotnet publish Tranzora.Api/Tranzora.Api.csproj -c Release -o /out --no-restore

# Node's Debian-built binary runs on the .NET Ubuntu runtime (newer glibc).
# The runtime assertion below fails the image build if a dependency is missing.
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runner
WORKDIR /app
COPY --from=deps /usr/local/bin/node /usr/local/bin/node
RUN node --version && dotnet --list-runtimes
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 ASPNETCORE_ENVIRONMENT=Production
COPY --from=web-build --chown=app:app /src/.next/standalone /app/web
COPY --from=web-build --chown=app:app /src/.next/static /app/web/.next/static
COPY --from=web-build --chown=app:app /src/public /app/web/public
COPY --from=api-build --chown=app:app /out /app/api
COPY --chown=app:app deploy/start-render.sh /app/start-render.sh
RUN chmod 755 /app/start-render.sh
USER app
EXPOSE 10000
ENTRYPOINT ["/app/start-render.sh"]
