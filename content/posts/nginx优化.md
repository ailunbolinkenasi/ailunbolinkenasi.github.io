---
title: Nginx简单的常规优化
tags:
  - nginx
categories:
  - nginx
description: 主要讲解nginx具体有那些优化项
abbrlink: cc632411
date: 2022-03-20 00:00:00
---

## 配置nginx的work_process

查看当前服务的CPU核心数量

```bash
[root@containerd-master1 ~]# grep processor /proc/cpuinfo | wc -l
8
```

如果你需要修改更多的工作进程,请修改配置文件中的`work_process`字段

- `auto`: 根据系统的CPU自动的设置工作进程数量

```conf
worker_processes  1; # 可选值 auto
```

## 配置work_connections

该参数表示每个工作进程最大处理的连接数,`CentOS`默认连接数为1024,连接数是可以修改的。
如果需要修改`ulimit`参数,请修改配置文件`/etc/security/limits.conf`

- noproc 是代表最大进程数
- nofile 是代表最大文件打开数

> 本次修改仅仅以Rocky Linux和CentOS为例,不同的系统修改方法可能有所差异.

```conf
* soft nofile 65535
* hard nofile 65535
```

配置nginx当中的`work_connections`

```conf
events {
    worker_connections  65535;
    use epoll;
}
```

> 简单的提一嘴ulimit的作用: 当进程打开的文件数目超过此限制时，该进程就会退出。

## 启用gzip压缩

nginx使用 gzip 进行文件压缩和解压缩,您可以节省带宽并在连接缓慢时提高网站的加载时间。

```conf
server {
    gzip on;  # 开启gzip
    gzip_vary on;
    gzip_min_length 10240;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml;
    gzip_disable "MSIE [1-6]\.";
}
```

## 限制nginx连接的超时

主要是为了减少打开和关闭连接时的处理器和网络开销

- `client_body_timeout`: 该指令设置请求体（request body）的读超时时间。仅当在一次readstep中，没有得到请求体，就会设为超时。超时后，nginx返回HTTP状态码408
- `client_header_timeout`: 指定等待client发送一个请求头的超时时间（例如:GET / HTTP/1.1)仅当在一次read中，没有收到请求头，才会被记录为超时
- `keepalive_timeout`: 指定了与`client`的`keep-alive`连接超时时间,超过这个时间后,服务器会关关闭连接。
- `send_timeout`: 指定客户端的响应超时时间。这个设置不会用于整个转发器，而是在两次客户端读取操作之间。如果在这段时间内，客户端没有读取任何数据，nginx就会关闭连接。

```conf
http
{
    client_body_timeout 12;
    client_header_timeout 12;
    keepalive_timeout 15;
    send_timeout 10;
}
```

## 调整缓冲区大小

调整nginx缓冲区以优化服务器性能。如果缓冲区大小太小，那么nginx将写入一个临时文件，导致大量 I/O 操作不断运行。

```conf
http
{
    client_body_buffer_size 10K;
    client_header_buffer_size 1k;
    client_max_body_size 8m;
    large_client_header_buffers 4 4k;
}
```

## 启用日志访问缓冲区

日志很重要，因为它们有助于解决问题。完全禁用日志不是一个好的做法。在这种情况下，您可以启用访问日志缓冲。这将允许nginx缓冲一系列日志并将它们一次写入日志文件，而不是对每个请求应用不同的日志操作。在nginx配置文件中添加以下行以允许访问日志缓冲

```conf
http {
    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';
    # 开启日志缓冲设置
    access_log  logs/access.log main buffer=32k flush=1m;
}
```

## 调整静态文件缓存

```conf
# 静态文件缓存内容
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
  expires 90d;
}
```