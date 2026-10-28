FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props ./
COPY Tranzora.Api/Tranzora.Api.csproj Tranzora.Api/
COPY Tranzora.Application/Tranzora.Application.csproj Tranzora.Application/
COPY Tranzora.Infrastructure/Tranzora.Infrastructure.csproj Tranzora.Infrastructure/
COPY Tranzora.Domain/Tranzora.Domain.csproj Tranzora.Domain/
RUN dotnet restore Tranzora.Api/Tranzora.Api.csproj
COPY . .
RUN dotnet publish Tranzora.Api/Tranzora.Api.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://+:${PORT:-8080}
USER app
EXPOSE ${PORT:-8080}
ENTRYPOINT ["dotnet", "Tranzora.Api.dll"]
