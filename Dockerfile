# FROM --platform=linux/arm64 mcr.microsoft.com/dotnet/sdk:8.0 AS build-env

# ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

# WORKDIR /TodoApi

# ADD *.sln .
# ADD *.csproj .

# # StackExchangeRedis instrumentation library is in beta, so it is not picked up
# # automatically by auto-instrumentation and needs to be added manually.
# # Ref: https://github.com/open-telemetry/opentelemetry-dotnet-contrib/tree/main/src/OpenTelemetry.Instrumentation.StackExchangeRedis#stackexchangeredis-instrumentation-for-opentelemetry
# RUN dotnet add package OpenTelemetry.Instrumentation.StackExchangeRedis --version 1.11.0-beta.2

# RUN dotnet restore

# ADD . .

# RUN dotnet publish -c Release -o out --no-restore


# FROM --platform=linux/arm64 mcr.microsoft.com/dotnet/aspnet:8.0

# # install OpenTelemetry .NET Automatic Instrumentation
# ARG OTEL_VERSION=1.9.0
# ENV OTEL_DOTNET_AUTO_HOME=/otel-dotnet-auto
# ADD https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation/releases/download/v${OTEL_VERSION}/otel-dotnet-auto-install.sh otel-dotnet-auto-install.sh
# RUN apt-get update && apt-get install -y curl unzip && \
#     sh otel-dotnet-auto-install.sh
# RUN chmod +x /otel-dotnet-auto/instrument.sh

# WORKDIR /TodoApi
# COPY --from=build-env /TodoApi/out /TodoApi

# EXPOSE 8080

# CMD ["/otel-dotnet-auto/instrument.sh", "dotnet", "TodoApi.dll"]


# # ######NEW#######################
# FROM --platform=linux/amd64 mcr.microsoft.com/dotnet/sdk:8.0 AS build-env
# ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
# WORKDIR /TodoApi

# # Copy solution & csproj
# ADD *.sln .
# ADD *.csproj .

# # Extra package for Redis instrumentation
# RUN dotnet add package OpenTelemetry.Instrumentation.StackExchangeRedis --version 1.11.0-beta.2

# RUN dotnet restore

# # Copy rest of the source and publish
# ADD . .
# RUN dotnet publish -c Release -o out --no-restore


# # ---------- RUNTIME STAGE (Amazon Linux 2, glibc 2.26) ----------
# FROM --platform=linux/amd64 amazonlinux:2

# # Install prerequisites, INCLUDING unzip
# RUN yum -y update && \
#     yum -y install \
#         curl \
#         tar \
#         gzip \
#         unzip \
#         libicu \
#         zlib \
#         ca-certificates && \
#     yum clean all

# # Install .NET 8 ASP.NET Core runtime manually
# ENV DOTNET_ROOT=/usr/share/dotnet
# ENV PATH="$PATH:/usr/share/dotnet"

# RUN curl -L https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh && \
#     chmod +x /tmp/dotnet-install.sh && \
#     /tmp/dotnet-install.sh --channel 8.0 --runtime aspnetcore --install-dir /usr/share/dotnet && \
#     ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet

# # Install OpenTelemetry .NET Automatic Instrumentation
# ARG OTEL_VERSION=1.9.0
# ENV OTEL_DOTNET_AUTO_HOME=/otel-dotnet-auto

# ADD https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation/releases/download/v${OTEL_VERSION}/otel-dotnet-auto-install.sh /tmp/otel-dotnet-auto-install.sh

# RUN chmod +x /tmp/otel-dotnet-auto-install.sh && \
#     sh /tmp/otel-dotnet-auto-install.sh && \
#     chmod +x /otel-dotnet-auto/instrument.sh

# WORKDIR /TodoApi
# COPY --from=build-env /TodoApi/out /TodoApi

# EXPOSE 8080

# # StartupHook / auto-instrumentation wrapper
# CMD ["/otel-dotnet-auto/instrument.sh", "dotnet", "TodoApi.dll"]



# # ---------- BUILD ----------
FROM --platform=linux/amd64 mcr.microsoft.com/dotnet/sdk:8.0 AS build-env
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
WORKDIR /TodoApi

# Copy only project files first for better layer caching
COPY *.sln ./
COPY *.csproj ./

# RID-aware restore (required because we publish with -r linux-x64)
RUN dotnet restore TodoApi.csproj -r linux-x64

# Copy the rest and publish
COPY . ./
RUN dotnet publish TodoApi.csproj -c Release -r linux-x64 --self-contained false -o /out --no-restore

# ---------- RUNTIME (Amazon Linux 2) ----------
FROM --platform=linux/amd64 amazonlinux:2

# Base OS deps
RUN yum -y update && \
    yum -y install \
      curl tar gzip unzip ca-certificates \
      libicu zlib shadow-utils findutils \
    && yum clean all

# Install .NET 8 ASP.NET Core runtime manually
ENV DOTNET_ROOT=/usr/share/dotnet
ENV PATH="$PATH:/usr/share/dotnet"

RUN curl -fSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh && \
    chmod +x /tmp/dotnet-install.sh && \
    /tmp/dotnet-install.sh --channel 8.0 --runtime aspnetcore --install-dir /usr/share/dotnet && \
    ln -sf /usr/share/dotnet/dotnet /usr/bin/dotnet && \
    rm -f /tmp/dotnet-install.sh

# ---------- Datadog tracer (dd-trace-dotnet auto instrumentation) ----------
ARG DD_DOTNET_TRACER_VERSION=3.6.0
ENV DD_DOTNET_TRACER_HOME=/opt/datadog

RUN mkdir -p /opt/datadog && \
    curl -fSL -o /tmp/dd-tracer.tar.gz \
      https://github.com/DataDog/dd-trace-dotnet/releases/download/v${DD_DOTNET_TRACER_VERSION}/datadog-dotnet-apm-${DD_DOTNET_TRACER_VERSION}.tar.gz && \
    tar -xzf /tmp/dd-tracer.tar.gz -C /opt/datadog && \
    rm -f /tmp/dd-tracer.tar.gz

# The profiler .so and integrations.json are not always in /opt/datadog root.
# Find them and create stable symlinks.
RUN set -e; \
    PROFILER_PATH="$(find /opt/datadog -type f -name 'Datadog.Trace.ClrProfiler.Native.so' | head -n 1)"; \
    echo "Profiler: ${PROFILER_PATH:-<not found>}"; \
    test -n "$PROFILER_PATH"; \
    ln -sf "$PROFILER_PATH" /opt/datadog/Datadog.Trace.ClrProfiler.Native.so; \
    INTEGRATIONS_PATH="$(find /opt/datadog -type f -name 'integrations.json' | head -n 1 || true)"; \
    echo "Integrations: ${INTEGRATIONS_PATH:-<not found>}"; \
    if [ -n "$INTEGRATIONS_PATH" ]; then \
      ln -sf "$INTEGRATIONS_PATH" /opt/datadog/integrations.json; \
    fi

# Enable dd-trace CLR profiler (auto-instrumentation)
ENV CORECLR_ENABLE_PROFILING=1 \
    CORECLR_PROFILER={846F5F1C-F9AE-4B07-969E-05C26BC060D8} \
    CORECLR_PROFILER_PATH=/opt/datadog/Datadog.Trace.ClrProfiler.Native.so \
    DD_DOTNET_TRACER_HOME=/opt/datadog 
##DD_INTEGRATIONS=/opt/datadog/integrations.json

# App
WORKDIR /TodoApi
COPY --from=build-env /out /TodoApi

EXPOSE 8080
ENV ASPNETCORE_URLS=http://0.0.0.0:8080

CMD ["dotnet", "/TodoApi/TodoApi.dll"]
