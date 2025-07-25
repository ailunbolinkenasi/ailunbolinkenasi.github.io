---
title: Traekfik基础使用指南
tags:
  - kubernetes
  - traefik
categories:
  - kubernetes
heroImage: {
  src: "https://doc.traefik.io/traefik/assets/img/traefik-architecture.png",
  inferSize: true
}
publishDate: 2023-04-07 00:00:00
slug: "/tech/kubernetes/traefik"
description: Traefik是一个开源的Kubernetes Ingress Controller，用于管理Kubernetes集群中的Ingress资源。
---

## Traekfik是什么

Traefik 是一种[开源](https://github.com/traefik/traefik) *边缘路由器*，它使您发布服务成为一种有趣而轻松的体验。它代表您的系统接收请求并找出哪些组件负责处理它们。

Traefik 的与众不同之处在于，除了它的许多功能之外，它还可以自动为您的服务发现正确的配置。当 Traefik 检查您的基础架构时，奇迹就会发生，它会在其中找到相关信息并发现哪个服务服务于哪个请求。

Traefik 原生兼容所有主要的集群技术，例如 Kubernetes、Docker、Docker Swarm、AWS、Mesos、Marathon，[等等](https://doc.traefik.io/traefik/providers/overview/)；并且可以同时处理很多。（它甚至适用于在裸机上运行的遗留软件。）

使用 Traefik，无需维护和同步单独的配置文件：一切都自动实时发生（无需重启，无连接中断）。使用 Traefik，您可以花时间为系统开发和部署新功能，而不是配置和维护其工作状态。

![](https://doc.traefik.io/traefik/assets/img/traefik-architecture.png)

### 边缘路由器

Traefik 是一个*Edge Router*，这意味着它是您平台的大门，它拦截并路由每个传入请求：它知道确定哪些服务处理哪些请求的所有逻辑和每条规则（基于[path](https://doc.traefik.io/traefik/routing/routers/#rule)，[host](https://doc.traefik.io/traefik/routing/routers/#rule)，[标头](https://doc.traefik.io/traefik/routing/routers/#rule)，[等等](https://doc.traefik.io/traefik/routing/routers/#rule)…）。

![边缘路由](https://doc.traefik.io/traefik/assets/img/traefik-concepts-1.png)

### 自动服务发现

传统上边缘路由器（或反向代理）需要一个配置文件，其中包含到您的服务的每条可能路径，Traefik 从服务本身获取它们。部署您的服务，您附加信息告诉 Traefik 服务可以处理的请求的特征。

![供应商](https://doc.traefik.io/traefik/assets/img/providers.png)

首先，当启动 Traefik 时，需要定义 `entrypoints`（入口点），然后，根据连接到这些 entrypoints 的**路由**来分析传入的请求，来查看他们是否与一组**规则**相匹配，如果匹配，则路由可能会将请求通过一系列**中间件**转换过后再转发到你的**服务**上去。在了解 Traefik 之前有几个核心概念我们必须要了解：

- `Providers` 用来自动发现平台上的服务，可以是编排工具、容器引擎或者 key-value 存储等，比如 Docker、Kubernetes、File
- `Entrypoints` 监听传入的流量（端口等…），是网络入口点，它们定义了接收请求的端口（HTTP 或者 TCP）。
- `Routers` 分析请求（host, path, headers, SSL, …），负责将传入请求连接到可以处理这些请求的服务上去。
- `Services` 将请求转发给你的应用（load balancing, …），负责配置如何获取最终将处理传入请求的实际服务。
- `Middlewares` 中间件，用来修改请求或者根据请求来做出一些判断（authentication, rate limiting, headers, …），中间件被附件到路由上，是一种在请求发送到你的**服务**之前（或者在服务的响应发送到客户端之前）调整请求的一种方法。

## 部署Traefik

> Traefik的配置可以使用两种方式：`静态配置`和`动态配置`

- 静态配置：在 Traefik 中定义静态配置选项有三种不同的、互斥的即你只能同时使用一种）方式。
  - 在配置文件中
  - 在命令行参数中
  - 作为环境变量
- 动态配置：Traefik从[提供者处获取其](https://doc.traefik.io/traefik/providers/overview/)*动态配置*：无论是编排器、服务注册表还是普通的旧配置文件。

```bash
# 使用Helm的方式进行部署Traefik2.9.x
[root@Online-Beijing-master1 ~]# helm repo add traefik https://traefik.github.io/charts
[root@Online-Beijing-master1 ~]# helm repo update
[root@Online-Beijing-master1 yaml]# helm fetch traefik/traefik
[root@Online-Beijing-master1 yaml]# tar -zxf traefik-21.1.0.tgz
```

1. 修改一下`value.yaml`中的部分内容，改动大概如下部分的内容

```yaml
deployment: 
  initContainers: 
    # The "volume-permissions" init container is required if you run into permission issues.
    # Related issue: https://github.com/traefik/traefik/issues/6825
    - name: volume-permissions
      image: busybox:1.35
      command: ["sh", "-c", "touch /data/acme.json && chmod -Rv 600 /data/* && chown 65532:65532 /data/acme.json"]
      volumeMounts:
        - name: data
          mountPath: /data
  websecure:
    port: 8443
    hostPort: 443
    expose: true
    exposedPort: 443
    protocol: TCP
  web:
    port: 8000
    hostPort: 80
    expose: true
    exposedPort: 80
    protocol: TCP
service:
  enabled: false

ingressRoute:
  dashboard:
    enabled: false

nodeSelector: 
  node.kubernetes.io/traefik-manager: 'true'
tolerations: 
  - key: "node-role.kubernetes.io/master"
    operator: "Equal"
    effect: "NoSchedule"
  - key: "node-role.kubernetes.io/control-plane"
    operator: "Equal"
    effect: "NoSchedule"
```

1. 创建一个`traefik-v2`的名称空间

```bash
[root@Online-Beijing-master1 yaml]# kubectl create ns traefik-v2
```

1. 部署Traefik

```bash
[root@Online-Beijing-master1 yaml]# helm install traefik ./traefik -f ./traefik/values.yaml --namespace traefik-v2
[root@Online-Beijing-master1 yaml]# kubectl get pods traefik-67b8896675-4xdrx -n traefik-v2 -o yaml
```

其中 `entryPoints` 属性定义了 `web` 和 `websecure` 这两个入口点的，并开启 `kubernetesingress` 和 `kubernetescrd` 这两个 provider，也就是我们可以使用 Kubernetes 原本的 Ingress 资源对象，也可以使用 Traefik 自己扩展的 IngressRoute 这样的 CRD 资源对象

```yaml
apiVersion: v1
kind: Pod
metadata:
......
spec:
  containers:
  - args:
    - --global.checknewversion
    - --global.sendanonymoususage
    - --entrypoints.metrics.address=:9100/tcp
    - --entrypoints.traefik.address=:9000/tcp
    - --entrypoints.web.address=:8000/tcp
    - --entrypoints.websecure.address=:8443/tcp
    - --api.dashboard=true
    - --ping=true
    - --metrics.prometheus=true
    - --metrics.prometheus.entrypoint=metrics
    - --providers.kubernetescrd
    - --providers.kubernetesingress
    - --entrypoints.websecure.http.tls=true
```

### 创建用于 Dashboard 访问的 IngressRoute 资源

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-dashboard
  namespace: traefik-v2
spec:
  entryPoints:
  - web # 这里对应的是web的entryPoints 如果是https就需要使用websecure的entryPoints
  routes:
  - match: Host(`traefik.kube.com`)  # 指定域名
    kind: Rule
    services:
    - name: api@internal
      kind: TraefikService  # 引用另外的 Traefik Service
[root@Online-Beijing-master1 yaml]# kubectl apply -f traefik.yaml
ingressroute.traefik.containo.us/traefik-dashboard created	
```

## Traefik的基本使用

### 自定义一个IngressRoute

假设我们要访问一个简单地`nginx`服务,下面是`traefik`的匹配规则
| 匹配规则                                    | 描述               |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `HeadersRegexp(`key`, `regexp`)`                             | `key`检查标题中是否定义了键，其值与正则表达式匹配`regexp`    |
| `Host(`example.com`, ...)`                                   | 检查请求域（主机标头值）是否针对给定的`domains`.             |
| `HostHeader(`example.com`, ...)`                             | 与 相同`Host`，仅因历史原因而存在。                          |
| `HostRegexp(`example.com`, `{subdomain:[a-z]+}.example.com`, ...)` | 匹配请求域。请参阅下面的“正则表达式语法”。                   |
| `Method(`GET`, ...)`                                         | 检查请求方法是否为给定的`methods`( `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`)之一 |
| `Path(`/path`, `/articles/{cat:[a-z]+}/{id:[0-9]+}`, ...)`   | 匹配准确的请求路径。请参阅下面的“正则表达式语法”。           |
| `PathPrefix(`/products/`, `/articles/{cat:[a-z]+}/{id:[0-9]+}`)` | 匹配请求前缀路径。请参阅下面的“正则表达式语法”。             |
| `Query(`foo=bar`, `bar=baz`)`                                | 匹配查询字符串参数。它接受一系列键=值对。                    |
| `ClientIP(`10.0.0.0/16`, `::1`)`                             | 如果请求客户端 IP 是给定的 IP/CIDR 之一，则匹配。它接受 IPv4、IPv6 和 CIDR |
```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-qingyang-http
  namespace: default
spec:
  entryPoints:
  - web # 依旧对应web
  routes:
  - match: Host(`traefik.qingyang.com`)  # 指定域名
    kind: Rule
    services:
    - name: vue-demo # 这个地方对应kubernetes的svc
      port: 80
```

如果我们需要开启`HTTPS`来访问我们这个应用的话，就需要监听 `websecure` 这个入口点，也就是通过 443 端口来访问，同样用 `HTTPS` 访问应用必然就需要证书，这里我们用 `openssl` 来创建一个自签名的证书：

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout tls.key -out tls.crt -subj "/CN=traefik.qingyang.com"
```

然后创建`secret`

```bash
[root@Online-Beijing-master1 yaml]# kubectl create secret tls traefik-demo-tls --cert=tls.crt --key=tls.key
```

这个时候我们就可以创建一个 `HTTPS` 访问应用的 `IngressRoute` 对象了

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-qingyang-https
spec:
  entryPoints:
    - websecure
  routes:
  - match: Host(`traefik.qingyang.com`)
    kind: Rule
    services:
    - name: vue-demo
      port: 80
  tls:
    secretName: traefik-demo-tls
```

### ACME自动签发

raefik 同样也支持使用 `Let’s Encrypt` 自动生成证书，要使用 `Let’s Encrypt` 来进行自动化 HTTPS，就需要首先开启 `ACME`，开启 `ACME` 需要通过静态配置的方式，也就是说可以通过环境变量、启动参数等方式来提供。

ACME 有多种校验方式 `tlsChallenge`、`httpChallenge` 和 `dnsChallenge` 三种验证方式，之前更常用的是 http 这种验证方式(可以百度一下)这几种的校验方式。要使用 tls 校验方式的话需要保证 Traefik 的 443 端口是可达的，dns 校验方式可以生成通配符的证书，只需要配置上 DNS 解析服务商的 API 访问密钥即可校验。我们这里用 DNS 校验的方式来为大家说明如何配置 ACME。

1. 重新修改一下刚刚Traefik的参数`values.yaml`

```yaml
additionalArguments:
# 使用 dns 验证方式
- --certificatesResolvers.ali.acme.dnsChallenge.provider=alidns
# 先使用staging环境进行验证，验证成功后再使用移除下面一行的配置
# - --certificatesResolvers.ali.acme.caServer=https://acme-staging-v02.api.letsencrypt.org/directory
# 邮箱配置
- --certificatesResolvers.ali.acme.email=ych_1024@163.com
# 保存 ACME 证书的位置
- --certificatesResolvers.ali.acme.storage=/data/acme.json

envFrom:
- secretRef:
    name: traefik-alidns-secret
    # ALICLOUD_ACCESS_KEY
    # ALICLOUD_SECRET_KEY
    # ALICLOUD_REGION_ID

persistence:
  enabled: true  # 开启持久化
  accessMode: ReadWriteOnce
  size: 128Mi
  path: /data

# 由于上面持久化了ACME的数据，需要重新配置下面的安全上下文
securityContext:
  readOnlyRootFilesystem: false
  runAsGroup: 0
  runAsUser: 0
  runAsNonRoot: false
```

然后更新`traefik`

```bash
helm up traefik ./traefik -f ./traefik/values.yaml --namespace traefik-v2
```

- 这样我们可以通过设置 `--certificatesresolvers.ali.acme.dnschallenge.provider=alidns` 参数来指定指定阿里云的 DNS 校验，要使用阿里云的 DNS 校验我们还需要配置3个环境变量：`ALICLOUD_ACCESS_KEY`、`ALICLOUD_SECRET_KEY`、`ALICLOUD_REGION_ID`，分别对应我们平时开发阿里云应用的时候的密钥，可以登录阿里云后台获取，由于这是比较私密的信息，所以我们用 Secret 对象来创建

```bash
kubectl create secret generic traefik-alidns-secret --from-literal=ALICLOUD_ACCESS_KEY=<aliyun ak> --from-literal=ALICLOUD_SECRET_KEY=<aliyun sk> --from-literal=ALICLOUD_REGION_ID=cn-beijing -n traefik-v2
```

- 创建完成后将这个 Secret 通过环境变量配置到 Traefik 的应用中，还有一个值得注意的是验证通过的证书我们这里存到 `/data/acme.json` 文件中，我们一定要将这个文件持久化，否则每次 Traefik 重建后就需要重新认证，而 `Let’s Encrypt` 本身校验次数是有限制的。所以我们在 values 中重新开启了数据持久化，不过开启过后需要我们提供一个可用的 PV 存储，由于我们将 Traefik 固定到 master1 节点上的，所以我们可以创建一个 hostpath 类型的 PV

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: traefik
spec:
  accessModes:
  - ReadWriteOnce
  capacity:
    storage: 128Mi
  hostPath:
    path: /data/k8s/traefik
```

1. 更新`IngressRoute`

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-qingyang-https
spec:
  entryPoints:
    - websecure
  routes:
  - match: Host(`traefik.qingyang.com`)
    kind: Rule
    services:
    - name: vue-demo
      port: 80
  tls:
    certResolver: ali
    domains:
    - main: "*.qingyang.com"
```

只需要将 tls 部分改成我们定义的 `ali` 这个证书解析器，如果我们想要生成一个通配符的域名证书的话可以定义 `domains` 参数来指定，然后更新 `IngressRoute `对象，这个时候我们再去用 HTTPS 访问我们的应用（当然需要将域名在阿里云 DNS 上做解析）

## 中间件

连接到路由器的中间件是一种在将请求发送到您的[服务](https://doc.traefik.io/traefik/routing/services/)之前（或在将服务的答案发送到客户端之前）调整请求的方法。

Traefik 中有几个可用的中间件，有的可以修改请求，headers，有的负责重定向，有的添加认证等等。

使用相同协议的中间件可以组合成链以适应各种场景。

- [HTTP中间件列表](https://doc.traefik.io/traefik/middlewares/http/overview/)
- [TCP中间件列表](https://doc.traefik.io/traefik/middlewares/tcp/overview/)

![img](https://doc.traefik.io/traefik/assets/img/middleware/overview.png)

### 强制跳转Https

Traefik 中也是可以配置强制跳转的，只是这个功能现在是通过中间件来提供的了。如下所示，我们使用 `redirectScheme` 中间件来创建提供强制跳转服务

```yaml
# Redirect to https
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware  # 创建一个中间件
metadata:
  name: test-redirectscheme
spec:
  redirectScheme:
    scheme: https
    permanent: true
---
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-qingyang-http
  namespace: default
spec:
  entryPoints:
  - web 
  routes:
  - match: Host(`traefik.qingyang.com`) 
    kind: Rule
    services:
    - name: vue-demo
      port: 80
    middlewares:
    - name: test-redirectscheme # 指定添加中间件的名称
```

> 如果你有具体需求的话请前往官网文档查看更多中间件的适用方法。

## Traefik Pilot

虽然 Traefik 已经默认实现了很多中间件，可以满足大部分我们日常的需求，但是在实际工作中，用户仍然还是有自定义中间件的需求，这就 [Traefik Pilot](https://pilot.traefik.io/) 的功能了。

Traefik Pilot 是一个 SaaS 平台，和 Traefik 进行链接来扩展其功能，它提供了很多功能，通过一个全局控制面板和 Dashboard 来增强对 Traefik 的观测和控制：

- Traefik 代理和代理组的网络活动的指标
- 服务健康问题和安全漏洞警报
- 扩展 Traefik 功能的插件

在 Traefik 可以使用 `Traefik Pilot` 的功能之前，必须先连接它们，我们只需要对 Traefik 的静态配置进行少量更改即可。

> 注意: Traefik 代理必须要能访问互联网才能连接到 `Traefik Pilot`，通过 HTTPS 在 443 端口上建立连接。 这个我就不演示了，我的虚拟机木有外网。

## 灰度发布

跟Ingress-nginx是一样的就不多介绍灰度发布是啥了

### 基于权重的轮询

这次使用的`Deployment`和上次`Ingress-nginx`一样，大家去Ingress那篇文章去找一下咯

我们可以直接利用`TraefikService`这个对象来配置基于权重的轮询

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: TraefikService
metadata:
  name: auy-cat-wrr
spec:
  weighted:
    services:
      - name: production
        weight: 3  # 定义权重
        port: 80
        kind: Service 
      - name: canary-service
        weight: 1
        port: 80
```

然后修改我们`IngressRoute`中使用的`TraefikService`

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-qingyang-http
  namespace: default
spec:
  entryPoints:
  - web 
  routes:
  - match: Host(`traefik.qingyang.com`) 
    kind: Rule
    services:
    - name: auy-cat-wrr
      kind: TraefikService # 使用声明的 TraefikService 服务，而不是 K8S 的 Service
```

## 流量复制

除了灰度发布之外，Traefik还引入了流量镜像服务，是一种可以将流入流量复制并同时将其发送给其他服务的方法，镜像服务可以获得给定百分比的请求同时也会忽略这部分请求的响应。

假设我们刚刚的`production`为线上服务`canary`为预览服务,现在希望请求`production`的流量同时复制一份也请求到`canary`版本中

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: TraefikService
metadata:
  name: mirror-replication
spec:
  mirroring:
    name: production
    port: 80
    mirrors:
    - name: canary-service
      percent: 50
      port: 80
---
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-qingyang-http
  namespace: default
spec:
  entryPoints:
  - web 
  routes:
  - match: Host(`traefik.qingyang.com`) 
    kind: Rule
    services:
    - name: mirror-replication
      kind: TraefikService # 使用声明的 TraefikService 服务，而不是 K8S 的 Service
```

## 代理Tcp/Udp

另外 Traefik2.X 已经支持了 TCP 服务的，下面我们以 mongo 为例来了解下 Traefik 是如何支持 TCP 服务得。

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mongo-traefik
  labels:
    app: mongo-traefik
spec:
  selector:
    matchLabels:
      app: mongo-traefik
  template:
    metadata:
      labels:
        app: mongo-traefik
    spec:
      containers:
      - name: mongo
        image: mongo
        ports:
        - containerPort: 27017
---
apiVersion: v1
kind: Service
metadata:
  name: mongo-traefik
spec:
  selector:
    app: mongo-traefik
  ports:
  - port: 27017
```

1. 新增`Traefik`的入口点

```yaml
ports:
  web:
    port: 8000
    hostPort: 80
  websecure:
    port: 8443
    hostPort: 443
  mongo:
    port: 27017
    hostPort: 27017
```

这里给入口点添加 `hostPort` 是为了能够通过节点的端口访问到服务，关于 entryPoints 入口点的更多信息，可以查看文档 [entrypoints](https://www.qikqiak.com/traefik-book/routing/entrypoints/) 了解更多信息。

```bash
helm upgrade --install traefik ./traefik -f ./traefik/values.yaml -n traefik-v2
```

2. 由于 Traefik 中使用 TCP 路由配置需要 `SNI`，而 `SNI` 又是依赖 `TLS` 的，所以我们需要配置证书才行，如果没有证书的话，我们可以使用通配符 `*` 进行配置，我们这里创建一个 `IngressRouteTCP` 类型的 CRD

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRouteTCP
metadata:
  name: mongo-traefik-tcp
spec:
  entryPoints:
    - mongo
  routes:
  - match: HostSNI(`*`)
    services:
    - name: mongo-traefik
      port: 27017
```

我这里没有`mongo`的客户端,直接校验一下端口就行了

```bash
telnet traefik.qingyang.com 27017
```

### 使用特定的域名进行代理访问

假设我现在有一个`mysql`服务，想通过`traefik.mysql.prod`进行连接访问.

我们在加一个`proxy-mysql`的`entryPoints`

```yaml
ports:
  web:
    port: 8000
    hostPort: 80
  websecure:
    port: 8443
    hostPort: 443
  mongo:
    port: 27017
    hostPort: 27017
  proxy-mysql:
    port: 3306
    hostPort: 3306
```

1. 生成一个`traefik.mysql.prod`的自签名证书

- 装个Golang`dnf install -y go`

```bash
git clone https://github.com/jsha/minica.git
cd minica
go build
[root@Online-Beijing-master1 minica]# ./minica --domains 'traefik.mysql.prod'
[root@Online-Beijing-master1 minica]# cd traefik.mysql.prod/
```

2. 生成`secret`,请确保你处于当前的`cert.key`和`key.pem`的目录下

```bash
kubectl create secret tls tcp-demo-mysql --cert=cert.pem --key=key.pem
```

3. 创建`IngressRouteTCP`对象

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRouteTCP
metadata:
  name: tcp-inner-mysql
  namespace: default
spec:
  entryPoints:
    - proxy-mysql
  routes:
  - match: HostSNI(`traefik.mysql.prod`)
    services:
    - name: env-prod-mysql-svc
      port: 3306
  tls: # 绑定Tls
    secretName: tcp-demo-mysql
```

### 代理一个Udp服务

1. 部署一个UDP服务

```yaml
kind: Deployment
apiVersion: apps/v1
metadata:
  name: whoami
  labels:
    app: whoami
spec:
  replicas: 1
  selector:
    matchLabels:
      app: whoami
  template:
    metadata:
      labels:
        app: whoami
    spec:
      containers:
        - name: whoami
          image: containous/whoamiudp
          ports:
            - name: web
              containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: whoamiudp
spec:
  ports:
  - protocol: UDP
    name: udp
    port: 8080
  selector:
    app: whoami
```

2. 在`Traefik`当中添加UDP的入口点，老样子修改`values.yaml`

```yaml
udpend:
  port: 18080
  hostPort: 18080
  protocol: UDP
```

3. UDP 的入口点增加成功后，接下来我们可以创建一个 `IngressRouteUDP` 类型的资源对象，用来代理 UDP 请求：

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRouteUDP
metadata:
  name: whoamiudp
spec:
  entryPoints:
  - udpend
  routes:
  - services:
    - name: whoamiudp
      port: 80
```