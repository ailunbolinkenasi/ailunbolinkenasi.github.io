# 优雅的多阶段构建微服务镜像


## 借助Maven Wrapper

首先我们说说`maven wrapper`的使用场景

假设我们所在的团队同时维护多个项目，不同的项目使用的`JDK`版本不同，使用的`maven`版本也不同，那么为了支持多项目开发，为了构建运行效果一致，你可能需要在本地管理多个`maven`版本，这会非常繁琐，从而引出了`maven wrapper`来解决这个`maven`版本的管理问题。

- 版本一致性：通过在`mvnw`配置中指定 Maven 版本，确保所有开发人员和持续集成环境使用相同的`maven`版本。
- 简化批量安装：不需要预先安装`maven`，直接运行`mvnw`命令就如安装了`mvn`一样，从而简化了项目的初始设置和配置。

## Maven Wrapper安装方式

- [maven-wrapper](https://maven.apache.org/wrapper/maven-wrapper/): 提供`maven-wrapper.jar`下载、安装和运行目标`maven`发行版。
- [maven-wrapper-distribution](https://maven.apache.org/wrapper/maven-wrapper-distribution/): 提供`mvnw`/`mvnw.cmd`脚本发行版，
- [maven-wrapper-plugin](https://maven.apache.org/wrapper/maven-wrapper-plugin/): `wrapper`用于轻松将 Wrapper 安装到项目中的插件。

1. 首先安装`maven wrapper`,默认情况下安装的是`only-script`版本，也就是精简版，不需要额外的`maven-wrapper.jar`。如果你需要安装`source`版本请使用`-Dtype=source`参数。

```bash
# 假设你的本地已经有了一个特定版本的maven,可以直接通过如下命令进行引入
mvn -N wrapper:wrapper

# 当然也可以指定引入的maven版本信息
mvn -N wrapper:wrapper -Dmaven=3.6.1
```

2. 检查是否安装成功,正常来讲是会出现一个`mvnw`和`mvnw.cmd`以及`.mvn`目录

```bash
[root@localhost maven-wrapper]# tree -fa
.
├── ./.mvn
│   └── ./.mvn/wrapper
│       └── ./.mvn/wrapper/maven-wrapper.properties
├── ./mvnw
└── ./mvnw.cmd

2 directories, 3 files
```

3. 修改`maven-wrapper.properties`定义的路径地址，因为用的是官方地址可能由于墙的问题无法进行下载，我这边采用`MinioS3`的地址来提前下好相关版本的`maven`包进行上传。

```properties
wrapperVersion=3.3.1
distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.6.1/apache-maven-3.6.1-bin.zip

# 正常修改distributionUrl的地址就可以了
distributionUrl=http://10.1.6.15:10240/software/apache-maven-3.6.1-bin.zip
```

正常能检测到相关的版本即表示成功

```bash
[root@localhost maven-wrapper]# ./mvnw --version
Apache Maven 3.6.1 (d66c9c0b3152b2e69ee9bac180bb8fcc8e6af555; 2019-04-05T03:00:29+08:00)
Maven home: /root/.m2/wrapper/dists/apache-maven-3.6.1/5256b4e
Java version: 1.8.0_391, vendor: Oracle Corporation, runtime: /usr/local/java/jre
Default locale: en_US, platform encoding: UTF-8
OS name: "linux", version: "4.18.0-372.9.1.el8.x86_64", arch: "amd64", family: "unix"
```

## 遇到小问题

如果大家在构建的过程中遇到了小问题可以看看小思路

1. 问题一：我明明指定了`distributionUrl`为我自的仓库地址，并且我上传的是`zip`的包，为什么每次我执行的的时候都会提示`wget: Failed to fetch http://10.1.6.15:10240/software/apache-maven-3.6.1-bin.tar.gz`

```bash
# select .zip or .tar.gz
if ! command -v unzip >/dev/null; then
  distributionUrl="${distributionUrl%.zip}.tar.gz"
  distributionUrlName="${distributionUrl##*/}"
fi
```

> 关于本问题的解释：由于官方的mvnw脚本当中存在select zip or tar.gz的文件类型判断，所以当服务器上没有`unzip`的命令的时候会出现如上提示。

## 官方的Dockerfile

- 其实都是引用了`BuildKit`的一些特性，如果需要了解更多的话可以使用`docker Desktop`来进行初始化看一下官方写的这些脚本。

```dockerfile
# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

################################################################################

# Create a stage for resolving and downloading dependencies.
FROM eclipse-temurin:17-jdk-jammy as deps

WORKDIR /build

# Copy the mvnw wrapper with executable permissions.
COPY --chmod=0755 mvnw mvnw
COPY .mvn/ .mvn/

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.m2 so that subsequent builds don't have to
# re-download packages.
RUN --mount=type=bind,source=pom.xml,target=pom.xml \
    --mount=type=cache,target=/root/.m2 ./mvnw dependency:go-offline -DskipTests

################################################################################

# Create a stage for building the application based on the stage with downloaded dependencies.
# This Dockerfile is optimized for Java applications that output an uber jar, which includes
# all the dependencies needed to run your app inside a JVM. If your app doesn't output an uber
# jar and instead relies on an application server like Apache Tomcat, you'll need to update this
# stage with the correct filename of your package and update the base image of the "final" stage
# use the relevant app server, e.g., using tomcat (https://hub.docker.com/_/tomcat/) as a base image.
FROM deps as package

WORKDIR /build

COPY ./src src/
RUN --mount=type=bind,source=pom.xml,target=pom.xml \
    --mount=type=cache,target=/root/.m2 \
    ./mvnw package -DskipTests && \
    mv target/$(./mvnw help:evaluate -Dexpression=project.artifactId -q -DforceStdout)-$(./mvnw help:evaluate -Dexpression=project.version -q -DforceStdout).jar target/app.jar


################################################################################

# Create a new stage for running the application that contains the minimal
# runtime dependencies for the application. This often uses a different base
# image from the install or build stage where the necessary files are copied
# from the install stage.
#
# The example below uses eclipse-turmin's JRE image as the foundation for running the app.
# By specifying the "17-jre-jammy" tag, it will also use whatever happens to be the
# most recent version of that tag when you build your Dockerfile.
# If reproducability is important, consider using a specific digest SHA, like
# eclipse-temurin@sha256:99cede493dfd88720b610eb8077c8688d3cca50003d76d1d539b0efc8cca72b4.
FROM eclipse-temurin:17-jre-jammy AS final

# Create a non-privileged user that the app will run under.
# See https://docs.docker.com/go/dockerfile-user-best-practices/
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/nonexistent" \
    --shell "/sbin/nologin" \
    --no-create-home \
    --uid "${UID}" \
    appuser
USER appuser

# Copy the executable from the "package" stage.
COPY --from=package build/target/app.jar app.jar

EXPOSE 9000

ENTRYPOINT [ "java", "-jar", "app.jar" ]
```

> 另外说一句：我永远相信最佳实践的内容，但是大厂的东西一定适合大厂，但是不一定适合你自己，所以我觉得应该带一些辨证的眼光去看待最佳实践的这些内容。

