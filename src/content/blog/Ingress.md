---
title: Ingress的简单使用
tags:
  - kubernetes
categories:
  - kubernetes
description: Ingress的简单使用
heroImage: { src: "https://d33wubrfki0l68.cloudfront.net/4f01eaec32889ff16ee255e97822b6d165b633f0/a54b4/zh-cn/docs/images/ingress.svg",inferSize: true }
slug: "/tech/kubernetes/nginx-ingress"
publishDate: 2023-03-08 00:00:00
---
# 什么是Ingress

Ingress 是对集群中服务的外部访问进行管理的 API 对象，典型的访问方式是 HTTP。

Ingress 可以提供负载均衡、SSL 终结和基于名称的虚拟托管。

[Ingress](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.26/#ingress-v1-networking-k8s-io) 公开从集群外部到集群内[服务](https://kubernetes.io/zh-cn/docs/concepts/services-networking/service/)的 HTTP 和 HTTPS 路由。 流量路由由 Ingress 资源上定义的规则控制。

下面是一个将所有流量都发送到同一 Service 的简单 Ingress 示例：

![img](https://d33wubrfki0l68.cloudfront.net/4f01eaec32889ff16ee255e97822b6d165b633f0/a54b4/zh-cn/docs/images/ingress.svg)

Ingress 其实就是从 Kuberenets 集群外部访问集群的一个入口，将外部的请求转发到集群内不同的 Service 上，其实就相当于 nginx、haproxy 等负载均衡代理服务器，可能你会觉得我们直接使用 nginx 就实现了，但是只使用 nginx 这种方式有很大缺陷，每次有新服务加入的时候怎么改 Nginx 配置？不可能让我们去手动更改或者滚动更新前端的 Nginx Pod 吧？那我们再加上一个服务发现的工具比如 consul 如何？貌似是可以，对吧？Ingress 实际上就是这样实现的，只是服务发现的功能自己实现了，不需要使用第三方的服务了，然后再加上一个域名规则定义，路由信息的刷新依靠 Ingress Controller 来提供。

Ingress Controller 可以理解为一个监听器，通过不断地监听 kube-apiserver，实时的感知后端 Service、Pod 的变化，当得到这些信息变化后，Ingress Controller 再结合 Ingress 的配置，更新反向代理负载均衡器，达到服务发现的作用。其实这点和服务发现工具 consul、 consul-template 非常类似。

> 现在可以供大家使用的 Ingress Controller 有很多，比如 `traefik`、`nginx-controller`、`Kubernetes Ingress Controller` for Kong、`HAProxy Ingress controller`，当然你也可以自己实现一个 Ingress Controller，现在普遍用得较多的是 traefik 和 nginx-controller，traefik 的性能较 nginx-controller 差，但是配置使用要简单许多，我们这里会重点给大家介绍 nginx-controller 以及 traefik 的使用。

## 安装NGINX Ingress Controller

- 官方文档：[NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/)

NGINX Ingress Controller 是使用 Kubernetes Ingress 资源对象构建的，用 ConfigMap 来存储 Nginx 配置的一种 Ingress Controller 实现。

由于 nginx-ingress 所在的节点需要能够访问外网，这样域名可以解析到这些节点上直接使用，所以需要让 nginx-ingress 绑定节点的 80 和 443 端口，所以可以使用 hostPort 来进行访问。

**查看当前Ingress-Nginx适用的kubernetes版本**

| Ingress-NGINX version | k8s supported version        | Alpine Version | Nginx Version |
| --------------------- | ---------------------------- | -------------- | ------------- |
| v1.6.4                | 1.26, 1.25, 1.24, 1.23       | 3.17.0         | 1.21.6        |
| v1.5.1                | 1.25, 1.24, 1.23             | 3.16.2         | 1.21.6        |
| v1.4.0                | 1.25, 1.24, 1.23, 1.22       | 3.16.2         | 1.19.10†      |
| v1.3.1                | 1.24, 1.23, 1.22, 1.21, 1.20 | 3.16.2         | 1.19.10†      |
| v1.3.0                | 1.24, 1.23, 1.22, 1.21, 1.20 | 3.16.0         | 1.19.10†      |
| v1.2.1                | 1.23, 1.22, 1.21, 1.20, 1.19 | 3.14.6         | 1.19.10†      |
| v1.1.3                | 1.23, 1.22, 1.21, 1.20, 1.19 | 3.14.4         | 1.19.10†      |
| v1.1.2                | 1.23, 1.22, 1.21, 1.20, 1.19 | 3.14.2         | 1.19.9†       |
| v1.1.1                | 1.23, 1.22, 1.21, 1.20, 1.19 | 3.14.2         | 1.19.9†       |
| v1.1.0                | 1.22, 1.21, 1.20, 1.19       | 3.14.2         | 1.19.9†       |
| v1.0.5                | 1.22, 1.21, 1.20, 1.19       | 3.14.2         | 1.19.9†       |
| v1.0.4                | 1.22, 1.21, 1.20, 1.19       | 3.14.2         | 1.19.9†       |
| v1.0.3                | 1.22, 1.21, 1.20, 1.19       | 3.14.2         | 1.19.9†       |
| v1.0.2                | 1.22, 1.21, 1.20, 1.19       | 3.14.2         | 1.19.9†       |
| v1.0.1                | 1.22, 1.21, 1.20, 1.19       | 3.14.2         | 1.19.9†       |
| v1.0.0                | 1.22, 1.21, 1.20, 1.19       | 3.13.5         | 1.20.1        |

1. 使用`Helm`进行部署`nginx-ingress-controller`

```
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm fetch ingress-nginx/ingress-nginx
tar -xvf ingress-nginx-4.5.2.tgz
```

1. 新建一个`value-test.yaml`的配置文件

- `dnsPolicy`：因为处于`hostNetwork:true`的状态下,Pod默认使用宿主机的DNS解析,这样会导致如果你使用`ServiceName`的方式来访问Pod的话会出现无法解析的情况。所以修改为`ClusterFirstWithHostNet`
- 请将`webhook`的镜像修改为`registry.cn-beijing.aliyuncs.com/polymerization/kube-webhook-certgen:v20220916-gd32f8c343`

```yaml
controller:
  name: controller
  image:
    repository: registry.cn-beijing.aliyuncs.com/polymerization/nginx-controller
    tag: "v1.6.4"
    digest: sha256:e727015a639975f4fc0808b91f9e88a83c60938b640ee6c2f5606ddd779c858d

  dnsPolicy: ClusterFirstWithHostNet

  hostNetwork: true

  publishService:  # hostNetwork 模式下设置为false，通过节点IP地址上报ingress status数据
    enabled: false

  kind: DaemonSet

  tolerations:   # 注意,如果你的Kubernetes集群中存在多个Taint需要全部进行容忍。
  - key: "node-role.kubernetes.io/master"
    operator: "Equal"
    effect: "NoSchedule"
  - key: "node-role.kubernetes.io/control-plane"
    operator: "Equal"
    effect: "NoSchedule"

  nodeSelector:   # 固定节点->请给3台master全部打上这个标签->个人建议将ingress-manager边缘化
    node.kubernetes.io/ingress-manager: 'true'

  service:  # HostNetwork 模式不需要创建service
    enabled: false

  admissionWebhooks:
    enable: true
    patch:
      enable: true
      image:
        registry: registry.cn-beijing.aliyuncs.com
        image:  polymerization/kube-webhook-certgen
        tag: v20220916-gd32f8c343
        digest: sha256:c0e3bef270e179a5e4ab373f8ba6d57f596f3683d9d40c33ea900b19ec182ba2
        pullPolicy: IfNotPresent

defaultBackend:
  enabled: false
```

1. 部署`ingress-controller`

```bash
# 安装
helm install --namespace ingress-nginx ingress-nginx ./ingress-nginx -f value-test.yaml
# 卸载
helm uninstall ingress-nginx --namespace ingress-nginx
```

## Ingress的基本使用

### 创建一个ingress资源对象

一个最小的 Ingress 资源示例

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: simple-qingyang-ingress
  namespace: out-apps
spec:
  ingressClassName: nginx
  rules:
  - host: nginx.qingyang.com # 将域名映射到后端服务
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: os-qingyang
            port:
              number: 80
```

Ingress 需要指定 `apiVersion`、`kind`、 `metadata`和 `spec` 字段。 Ingress 对象的命名必须是合法的 [DNS 子域名名称](https://kubernetes.io/zh-cn/docs/concepts/overview/working-with-objects/names#dns-subdomain-names)。 关于如何使用配置文件，请参见[部署应用](https://kubernetes.io/zh-cn/docs/tasks/run-application/run-stateless-application-deployment/)、 [配置容器](https://kubernetes.io/zh-cn/docs/tasks/configure-pod-container/configure-pod-configmap/)、 [管理资源](https://kubernetes.io/zh-cn/docs/concepts/cluster-administration/manage-deployment/)。 Ingress 经常使用注解（annotations）来配置一些选项，具体取决于 Ingress 控制器，例如[重写目标注解](https://github.com/kubernetes/ingress-nginx/blob/main/docs/examples/rewrite/README.md)。 不同的 [Ingress 控制器](https://kubernetes.io/zh-cn/docs/concepts/services-networking/ingress-controllers)支持不同的注解。 查看你所选的 Ingress 控制器的文档，以了解其支持哪些注解。

> 如果 `ingressClassName` 被省略，那么你应该定义一个默认 `Ingress 类`,否则无法转发服务

创建一个默认的`ingressClass`

```yaml
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  labels:
    app.kubernetes.io/component: controller
  name: default-nginx
  annotations:
    ingressclass.kubernetes.io/is-default-class: "true"
spec:
  controller: k8s.io/ingress-nginx
```

有一些 Ingress 控制器不需要定义默认的 `IngressClass`。比如：Ingress-NGINX 控制器可以通过[参数](https://kubernetes.github.io/ingress-nginx/#what-is-the-flag-watch-ingress-without-class) `--watch-ingress-without-class` 来配置。 不过仍然推荐创建默认的`ingressClass`

> 可以看一下简单地ingress-controller请求流程

1. 客户端首先对 `ngdemo.qikqiak.com` 执行 DNS 解析，得到 Ingress Controller 所在节点的 IP
2. 后客户端向 Ingress Controller 发送 HTTP 请求
3. 根据 Ingress 对象里面的描述匹配域名，找到对应的 Service 对象，并获取关联的 Endpoints 列表，将客户端的请求转发给其中一个 Pod

### 创建Todo-app测试(暂时废弃)

1. 首先部署`MongoDB`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mongo
spec:
  selector:
    matchLabels:
      app: mongo
  template:
    metadata:
      labels:
        app: mongo
    spec:
      volumes:
      - name: data
        emptyDir: {}
      - name: resolv-conf
        configMap:
          name: cache-dns
          items:
          - key: resolv.conf
            path: resolv.conf
      containers:
      - name: mongo
        image: mongo
        ports:
        - containerPort: 27017
        volumeMounts:
        - name: data
          mountPath: /data/db
        - name: resolv-conf
          mountPath: /etc/resolv.conf
          subPath: resolv.conf
---
apiVersion: v1
kind: Service
metadata:
  name: mongo
spec:
  selector:
    app: mongo
  type: ClusterIP
  ports:
  - name: db
    port: 27017
    targetPort: 27017
```

1. 创建Todo

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: todo
spec:
  selector:
    matchLabels:
      app: todo
  template:
    metadata:
      labels:
        app: todo
    spec:
      containers:
      - name: web
        image: cnych/todo:v1.1
        env:
        - name: "DBHOST"
          value: "mongodb://mongo.default.svc.cluster.local:27017"
        ports:
        - containerPort: 3000

---
apiVersion: v1
kind: Service
metadata:
  name: todo
spec:
  selector:
    app: todo
  type: ClusterIP
  ports:
  - name: web
    port: 3000
    targetPort: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: todo
spec:
  ingressClassName: nginx
  rules:
  - host: nginx.qingyang.com # 将域名映射到后端服务
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: todo
            port:
              number: 3000
```

### URL Rewrite

Rewrite的Ingress注解

| [nginx.ingress.kubernetes.io/rewrite-target](http://nginx.ingress.kubernetes.io/rewrite-target) | Target URI where the traffic must be redirected              | string |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------ |
| [nginx.ingress.kubernetes.io/ssl-redirect](http://nginx.ingress.kubernetes.io/ssl-redirect) | Indicates if the location section is only accessible via SSL (defaults to True when Ingress contains a Certificate) | bool   |
| [nginx.ingress.kubernetes.io/force-ssl-redirect](http://nginx.ingress.kubernetes.io/force-ssl-redirect) | Forces the redirection to HTTPS even if the Ingress is not TLS Enabled | bool   |
| [nginx.ingress.kubernetes.io/app-root](http://nginx.ingress.kubernetes.io/app-root) | Defines the Application Root that the Controller must redirect if it’s in `/` context | string |
| [nginx.ingress.kubernetes.io/use-regex](http://nginx.ingress.kubernetes.io/use-regex) | Indicates if the paths defined on an Ingress use regular expressions | bool   |

现在我们需要对访问的 URL 路径做一个 Rewrite，比如在 PATH 中添加一个 app 的前缀，关于 Rewrite 的操作在 [ingress-nginx 官方文档](https://kubernetes.github.io/ingress-nginx/examples/rewrite/)中也给出对应的说明。

- `nginx.ingress.kubernetes.io/rewrite-target`: 流量必须重定向的目标URI(Target URI where the traffic must be redirected)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: todo
  annotations:
      nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  ingressClassName: nginx
  rules:
  - host: nginx.qingyang.com 
    http:
      paths:
      - path: /something(/|$)(.*) # 匹配/something和/something/*
        pathType: Prefix
        backend:
          service:
            name: todo
            port:
              number: 3000
```

在此入口定义中，捕获的任何字符都`(.*)`将分配给占位符`$2`，然后将其用作注释中的参数`rewrite-target`。

例如，上面的入口定义将导致以下重写：

- `nginx.qingyang.com/something`改写为`nginx.qingyang.com/`
- `nginx.qingyang.com/something/`改写为`nginx.qingyang.com/`
- `nginx.qingyang.com/something/new`改写为`nginx.qingyang.com/new`

> 使用此方法可能会导致部分`css、js`等内容无法找到,可以使用以下方法实现

1. 通过`configuration-snippet`注解

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: todo
  annotations:
      nginx.ingress.kubernetes.io/rewrite-target: /$2
      nginx.ingress.kubernetes.io/configuration-snippet: |
        rewrite ^/css/(.*)$ /something/css/$1  redirect; # 为css样式添加/something前缀
        rewrite ^/js/(.*)$ /something/js/$1
```

## Basic Auth

们还可以在 Ingress Controller 上面配置一些基本的 Auth 认证，比如 Basic Auth，可以用 htpasswd 生成一个密码文件来验证身份验证。

```
[root@Online-Beijing-master1 ~]# htpasswd -c auth admin
```

创建一个`secret`

```
[root@Online-Beijing-master1 ~]# kubectl create secret generic basic-auth --from-file=authBasic Auth 的 Ingress 对象：
```

创建一个具有 `Basic Auth` 的 Ingress 对象

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: basic-auth-demo
  annotations:
    nginx.ingress.kubernetes.io/auth-type: basic
    nginx.ingress.kubernetes.io/auth-secret: basic-auth
    nginx.ingress.kubernetes.io/auth-realm: 'Authentication Required - admin'
spec:
  ingressClassName: nginx
  rules:
  - host: nginx.qingyang.com 
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: os-vue-comment
            port:
              number: 80
```

正常会弹出来认证窗口，进行认证就行。

## 灰度应用

在日常工作中我们经常需要对服务进行版本更新升级，所以我们经常会使用到滚动升级、蓝绿发布、灰度发布等不同的发布操作。而 `ingress-nginx` 支持通过 Annotations 配置来实现不同场景下的灰度发布和测试，可以满足金丝雀发布、蓝绿部署与 A/B 测试等业务场景。

在某些情况下，您可能希望通过向与生产服务不同的服务发送少量请求来`金丝雀`一组新的更改。Canary 注释使 Ingress 规范可以充当请求路由到的替代服务，具体取决于应用的规则。

[ingress-nginx 的 Annotations](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/#canary) 支持以下 4 种 Canary 规则：

- `nginx.ingress.kubernetes.io/canary-by-header`: 基于 Request Header 的流量切分，适用于灰度发布以及 A/B 测试。当 Request Header 设置为 always 时，请求将会被一直发送到 Canary 版本；当 Request Header 设置为 never时，请求不会被发送到 Canary 入口；对于任何其他 Header 值，将忽略 Header，并通过优先级将请求与其他金丝雀规则进行优先级的比较。
- `nginx.ingress.kubernetes.io/canary-by-header-value`: 要匹配的 Request Header 的值，用于通知 Ingress 将请求路由到 Canary Ingress 中指定的服务。当 Request Header 设置为此值时，它将被路由到 Canary 入口。该规则允许用户自定义 Request Header 的值。此注释必须与 一起使用`nginx.ingress.kubernetes.io/canary-by-header`。如果未定义`canary-by-header`,那么该注解没有任何效果。
- `nginx.ingress.kubernetes.io/canary-weight`: 基于服务权重的流量切分，适用于蓝绿部署，权重范围 0 - 100 按百分比将请求路由到 Canary Ingress 中指定的服务。权重为 0 意味着该金丝雀规则不会向 Canary 入口的服务发送任何请求，权重为 100 意味着所有请求都将被发送到 Canary 入口。
- `nginx.ingress.kubernetes.io/canary-by-cookie`: 基于 cookie 的流量切分，适用于灰度发布与 A/B 测试。用于通知 Ingress 将请求路由到 Canary Ingress 中指定的服务的cookie。当 cookie 值设置为 always 时，它将被路由到 Canary 入口；当 cookie 值设置为 never 时，请求不会被发送到 Canary 入口；对于任何其他值，将忽略 cookie 并将请求与其他金丝雀规则进行优先级的比较。

> Canary 规则按优先顺序进行评估。优先级如下：`canary-by-header -> canary-by-cookie -> canary-weight`

把以上的四个 annotation 规则可以总体划分为以下两类：

### 基于权重的的Canary规则

![img](https://pek3b.qingstor.com/kubesphere-docs/png/20190826201233.png)

### 基于用户请求的Canary规则

![img](https://pek3b.qingstor.com/kubesphere-docs/png/20190826204915.png)

### 灰度验证

1. 首先我们先创建一个基于`Producation`版本的应用

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: production-app
  labels:
    version: production 
spec:
  replicas: 1
  selector:
    matchLabels:
      version: production
  template:
    metadata:
      labels:
        version: production
    spec:
      containers:
      - name: production-demo
        image: mirrorgooglecontainers/echoserver:1.10
        ports:
        - containerPort: 8080
        env:
          - name: NODE_NAME
            valueFrom:
              fieldRef:
                fieldPath: spec.nodeName
          - name: POD_NAME
            valueFrom:
              fieldRef:
                fieldPath: metadata.name
          - name: POD_NAMESPACE
            valueFrom:
              fieldRef:
                fieldPath: metadata.namespace
          - name: POD_IP
            valueFrom:
              fieldRef:
                fieldPath: status.podIP
---
apiVersion: v1
kind: Service
metadata:
  name: production-service
  labels:
    version: production
spec:
  ports:
  - port: 80
    targetPort: 8080
    protocol: TCP
    name: http
  selector:
    version: production
```

1. 创建Production 版本的应用路由 (Ingress)。

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: production-ingress
spec:
  ingressClassName: nginx
  rules:
  - host: prod.qingyang.com 
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: production-service
            port:
              number: 80
```

1. 创建Canary版本的应用上线

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: canary-demo
  labels:
    app: canary-app
    version: canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: canary-app
  template:
    metadata:
      labels:
        app: canary-app
    spec:
      containers:
      - name: canary-demo
        image: mirrorgooglecontainers/echoserver:1.10
        ports:
        - containerPort: 8080
        env:
          - name: NODE_NAME
            valueFrom:
              fieldRef:
                fieldPath: spec.nodeName
          - name: POD_NAME
            valueFrom:
              fieldRef:
                fieldPath: metadata.name
          - name: POD_NAMESPACE
            valueFrom:
              fieldRef:
                fieldPath: metadata.namespace
          - name: POD_IP
            valueFrom:
              fieldRef:
                fieldPath: status.podIP
---
apiVersion: v1
kind: Service
metadata:
  name: canary-service
  labels:
    version: canary
spec:
  ports:
  - port: 80
    targetPort: 8080
    protocol: TCP
    name: http
  selector:
    app: canary-app
```

#### 基于权重的Canary规则

基于权重的流量切分的典型应用场景就是`蓝绿部署`，可通过将权重设置为 0 或 100 来实现。例如，可将 Green 版本设置为主要部分，并将 Blue 版本的入口配置为 Canary。最初，将权重设置为 0，因此不会将流量代理到 Blue 版本。一旦新版本测试和验证都成功后，即可将 Blue 版本的权重设置为 100，即所有流量从 Green 版本转向 Blue。

> 以下 Ingress 示例的 Canary 版本使用了**基于权重进行流量切分**的 annotation 规则，将分配 **30%** 的流量请求发送至 Canary 版本。

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: canary-ingress
  annotations:
    nginx.ingress.kubernetes.io/canary: "true" # 开启canary机制
    nginx.ingress.kubernetes.io/canary-weight: "30" # 切分30的流量到canary版本中
spec:
  ingressClassName: nginx
  rules:
  - host: prod.qingyang.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: canary-service
            port: 
              number: 80
```

> 应用的 Canary 版本基于权重 (30%) 进行流量切分后，访问到 Canary 版本的概率接近 30%，流量比例可能会有小范围的浮动。

#### 基于 Request Header

基于 Request Header 进行流量切分的典型应用场景即`灰度发布或 A/B 测试场景`。参考以下截图，在 KubeSphere 给 Canary 版本的应用路由 (Ingress) 新增一条 annotation `nginx.ingress.kubernetes.io/canary-by-header: canary`(这里的 annotation 的 value 可以是任意值)，使当前的 Ingress 实现基于 Request Header 进行流量切分。

> 金丝雀规则按优先顺序 `canary-by-header - > canary-by-cookie - > canary-weight`进行如下排序，因此以下情况将忽略原有 canary-weight 的规则。

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: canary-ingress
  annotations:
    nginx.ingress.kubernetes.io/canary-by-header: "canary-header" # 添加header
    nginx.ingress.kubernetes.io/canary: "true" # 开启canary机制
    nginx.ingress.kubernetes.io/canary-weight: "30" # 切分30的流量到canary版本中
spec:
  ingressClassName: nginx
  rules:
  - host: prod.qingyang.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: canary-service
            port: 
              number: 80
```

我们尝试访问一下

```bash
[root@Online-Beijing-master1 ~]# for i in $(seq 1 10); do curl -s prod.qingyang.com | grep "Hostname"; done
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: canary-demo-54dfb9bd-n2zlg
Hostname: production-app-678488687f-s4sbd
```

尝试加入请求头访问

- 如果你的`canary-header`的值为`never`则表示请求永远不会请求到当前版本,如果你的`canary-header`的值设置为`always`的话则表示永远请求当前版本

```bash
[root@Online-Beijing-master1 ~]# for i in $(seq 1 10); do curl -s -H "canary-header: never" prod.qingyang.com | grep "Hostname"; done
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
Hostname: production-app-678488687f-s4sbd
------------------------------------------------
[root@Online-Beijing-master1 ~]# for i in $(seq 1 10); do curl -s -H "canary-header: always" prod.qingyang.com | grep "Hostname"; done
Hostname: canary-demo-54dfb9bd-n2zlg
Hostname: canary-demo-54dfb9bd-n2zlg
Hostname: canary-demo-54dfb9bd-n2zlg
Hostname: canary-demo-54dfb9bd-n2zlg
Hostname: canary-demo-54dfb9bd-n2zlg
Hostname: canary-demo-54dfb9bd-n2zlg
Hostname: canary-demo-54dfb9bd-n2zlg
Hostname: canary-demo-54dfb9bd-n2zlg
Hostname: canary-demo-54dfb9bd-n2zlg
Hostname: canary-demo-54dfb9bd-n2zlg
```

如果你想让用户请求到指定的服务上可以添加`ginx.ingress.kubernetes.io/canary-by-header-value: user-value`,当请求访问携带`canary-header: user-value`的时候,那么该请求会被转发到`canary`版本。

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: canary-ingress
  annotations:
    nginx.ingress.kubernetes.io/canary-by-header-value: "user-value"
    nginx.ingress.kubernetes.io/canary-by-header: "canary-header" # 添加header
    nginx.ingress.kubernetes.io/canary: "true" # 开启canary机制
    nginx.ingress.kubernetes.io/canary-weight: "30" # 切分30的流量到canary版本中
spec:
  ingressClassName: nginx
  rules:
  - host: prod.qingyang.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: canary-service
            port: 
              number: 80
```

#### 基于 Cookie的canary

与基于 Request Header 的 annotation 用法规则类似。例如在 `A/B 测试场景`下，需要让地域为北京的用户访问 Canary 版本。那么当 cookie 的 annotation 设置为 `nginx.ingress.kubernetes.io/canary-by-cookie: "users_from_beijing"`，此时后台可对登录的用户请求进行检查，如果该用户访问源来自北京则设置 cookie `users_from_beijing`的值为 `always`，这样就可以确保北京的用户仅访问 Canary 版本

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: canary-ingress
  annotations:
    nginx.ingress.kubernetes.io/canary-by-cookie: "user_from_beijing" # 添加cookie
    nginx.ingress.kubernetes.io/canary: "true" # 开启canary机制
    nginx.ingress.kubernetes.io/canary-weight: "30" # 切分30的流量到canary版本中
spec:
  ingressClassName: nginx
  rules:
  - host: prod.qingyang.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: canary-service
            port: 
              number: 80
```

## 自签HTTPS

如果我们需要用 HTTPS 来访问我们这个应用的话，就需要监听 443 端口了，同样用 HTTPS 访问应用必然就需要证书，这里我们用 `openssl` 来创建一个自签名的证书：

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout tls.key -out tls.crt -subj "/CN=prod.qingyang.com"
```

创建`tls`类型的`secret`

```bash
kubectl create secret tls self-sign-nginx --cert=tls.crt --key=tls.key
```

创建带`tls`的`ingress`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: canary-ingress
  annotations:
    nginx.ingress.kubernetes.io/canary: "true" # 开启canary机制
    nginx.ingress.kubernetes.io/canary-weight: "30" # 切分30的流量到canary版本中
spec:
  ingressClassName: nginx
  rules:
  - host: prod.qingyang.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: nginx-demo
            port: 
              number: 80
  tls:
  - hosts: 
    - prod.qingyang.com
    secretName: self-sign-nginx
```

## CertManager 自动 HTTPS

cert-manager 将证书和证书颁发者作为资源类型添加到 Kubernetes 集群中，并简化了这些证书的获取、更新和使用过程。

它可以从各种受支持的来源颁发证书，包括 [Let’s Encrypt](https://letsencrypt.org/)、[HashiCorp Vault](https://www.vaultproject.io/)和[Venafi](https://www.venafi.com/)以及私有 PKI。

它将确保证书有效且最新，并尝试在到期前的配置时间更新证书。

它大致基于 [kube-lego](https://github.com/jetstack/kube-lego)的工作，并借鉴了其他类似项目（例如 [kube-cert-manager）](https://github.com/PalmStoneGames/kube-cert-manager)的一些智慧。

![CertManager工作原理](https://cert-manager.io/images/high-level-overview.svg)

- `Issuers`: 代表的是证书颁发者，可以定义各种提供者的证书颁发者，当前支持基于 `Let's Encrypt/HashiCorp/Vault` 和 CA 的证书颁发者，还可以定义不同环境下的证书颁发者。
- `Certificates`: 代表的是生成证书的请求.

### 部署cert-manager

好像这个`quay.io`能拉下来了…

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.11.0/cert-manager.yaml
```

正常部署完成可以看到Pod正在运行

```bash
[root@Online-Beijing-master1 ~]# kubectl get pods -n cert-manager
NAME                                       READY   STATUS    RESTARTS   AGE
cert-manager-6499989f7-m6vdj               1/1     Running   0          2m30s
cert-manager-cainjector-645b688547-xjcb8   1/1     Running   0          2m30s
cert-manager-webhook-6b7f49999f-mcnf7      1/1     Running   0          2m30s
```

我们可以通过下面的测试来验证下是否可以签发基本的证书类型，创建一个 Issuer 资源对象来测试 webhook 工作是否正常(在开始签发证书之前，必须在群集中至少配置一个 Issuer 或 ClusterIssuer 资源)

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: cert-manager-test
---
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: test-selfsigned
  namespace: cert-manager-test
spec:
  selfSigned: {}  # 配置自签名的证书机构类型
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: selfsigned-cert
  namespace: cert-manager-test
spec:
  dnsNames:
  - example.com
  secretName: selfsigned-cert-tls
  issuerRef:
    name: test-selfsigned
```

### 自动HTTPS

`Let's Encrypt` 使用 `ACME` 协议来校验域名是否真的属于你，校验成功后就可以自动颁发免费证书，证书有效期只有 90 天，在到期前需要再校验一次来实现续期，而 cert-manager 是可以自动续期的，所以事实上并不用担心证书过期的问题。目前主要有 HTTP 和 DNS 两种校验方式。

#### HTTP-01 校验

`HTTP-01` 的校验是通过给你域名指向的 HTTP 服务增加一个临时 location，在校验的时候 `Let's Encrypt` 会发送 http 请求到 `http://<YOUR_DOMAIN>/.well-known/acme-challenge/<TOKEN>`，其中 `YOUR_DOMAIN` 就是被校验的域名，`TOKEN` 是 cert-manager 生成的一个路径，它通过修改 Ingress 规则来增加这个临时校验路径并指向提供 TOKEN 的服务。`Let's Encrypt` 会对比 TOKEN 是否符合预期，校验成功后就会颁发证书了，不过这种方法不支持泛域名证书。

使用 HTTP 校验这种方式，首先需要将域名解析配置好，也就是需要保证 ACME 服务端可以正常访问到你的 HTTP 服务。这里我们以上面的 TODO 应用为例，我们已经将 `demo.qingyang.com` 域名做好了正确的解析。

由于 Let’s Encrypt 的生产环境有着严格的接口调用限制，所以一般我们需要先在 staging 环境测试通过后，再切换到生产环境。首先我们创建一个全局范围 staging 环境使用的 HTTP-01 校验方式的证书颁发机构：

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    # ACME服务端地址
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    # 注册ACME的邮箱
    email: ailunbolinkenasi@gmail.com
    # 用于存放ACME帐号privateKey的secret
    privateKeySecretRef:
      name: example-issuer-account-key
    solvers:
    - http01:  # ACME的类型
        ingress:
          class: nginx # 指定ingress的名称
```

接下来我们就可以生成免费证书了，cert-manager 给我们提供了 `Certificate` 这个用于生成证书的自定义资源对象，不过这个对象需要在一个具体的命名空间下使用，证书最终会在这个命名空间下以 Secret 的资源对象存储。我们这里是要结合 ingress-nginx 一起使用，实际上我们只需要修改 Ingress 对象，添加上 cert-manager 的相关注解即可，不需要手动创建 Certificate 对象了。

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: https-ingress
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-staging"  # 使用哪个issuer
spec:
  ingressClassName: nginx
  tls:
  - hosts:
      - demo.qingyang.com
    secretName: demo-qingyang-com-tls   # 用于存储证书的Secret对象名字
  rules:
  - host: demo.qingyang.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: vue-demo
            port: 
              number: 80
```

创建完成后会多出一个`ingress`对象,主要是为了让`acme`可以访问到当前的的`token`

```bash
[root@Online-Beijing-master1 ~]# kubectl get ingress
NAME                        CLASS    HOSTS               ADDRESS                         PORTS     AGE
cm-acme-http-solver-xpxm7   <none>   demo.qingyang.com   10.1.6.24,10.1.6.45,10.1.6.48   80        7m51s
https-ingress               nginx    demo.qingyang.com   10.1.6.24,10.1.6.45,10.1.6.48   80, 443   7m55s
```

可以查看当前的`acme`认证,其中`/.well-known/acme-challenge/pVY-ihomZPdlWDMt44cV9qZUwMQScjHvd3Zkf_FDLRI`是被验证对象

```bash
[root@Online-Beijing-master1 ~]# kubectl describe ingress cm-acme-http-solver-xpxm7
Name:             cm-acme-http-solver-xpxm7
Labels:           acme.cert-manager.io/http-domain=1002178207
                  acme.cert-manager.io/http-token=1266355919
                  acme.cert-manager.io/http01-solver=true
Namespace:        default
Address:          10.1.6.24,10.1.6.45,10.1.6.48
Ingress Class:    <none>
Default backend:  <default>
Rules:
  Host               Path  Backends
  ----               ----  --------
  demo.qingyang.com
                     /.well-known/acme-challenge/pVY-ihomZPdlWDMt44cV9qZUwMQScjHvd3Zkf_FDLRI   cm-acme-http-solver-f4ntj:8089 (10.10.180.124:8089)
Annotations:         kubernetes.io/ingress.class: nginx
                     nginx.ingress.kubernetes.io/whitelist-source-range: 0.0.0.0/0,::/0
Events:
  Type    Reason  Age                    From                      Message
  ----    ------  ----                   ----                      -------
  Normal  Sync    7m46s (x2 over 8m13s)  nginx-ingress-controller  Scheduled for sync
  Normal  Sync    7m46s (x2 over 8m13s)  nginx-ingress-controller  Scheduled for sync
  Normal  Sync    7m46s (x2 over 8m13s)  nginx-ingress-controller  Scheduled for sync
```

你可以尝试访问`https://demo.qingyang.com/.well-known/acme-challenge/pVY-ihomZPdlWDMt44cV9qZUwMQScjHvd3Zkf_FDLRI`。正常会出现具体的`验证密钥`即成功.

> 由于我的是本地自己搭建的kubernetes集群,没有外部解析的访问权限所以这个地方就没办法给大家演示了。

#### DNS-01 校验

`NS-01` 的校验是通过 DNS 提供商的 API 拿到你的 DNS 控制权限， 在 `Let's Encrypt` 为 cert-manager 提供 TOKEN 后，cert-manager 将创建从该 TOKEN 和你的帐户密钥派生的 `TXT` 记录，并将该记录放在 `_acme-challenge.<YOUR_DOMAIN>`。然后 `Let's Encrypt` 将向 DNS 系统查询该记录，如果找到匹配项，就可以颁发证书，这种方法是支持泛域名证书的。

DNS-01 支持多种不同的服务提供商，直接在 Issuer 或者 ClusterIssuer 中可以直接配置，对于一些不支持的 DNS 服务提供商可以使用外部 webhook 来提供支持，比如阿里云的 DNS 解析默认情况下是不支持的，我们可以使用阿里云这个 webhook 来提供支持。

- [alidns-webhook](https://github.com/pragkent/alidns-webhook)

1. 安装`alidns-webhook`

```bash
kubectl apply -f https://raw.githubusercontent.com/pragkent/alidns-webhook/master/deploy/bundle.yaml
```

1. 接着创建一个包含访问阿里云 DNS 认证密钥信息的 Secret 对象，对应的 `accessk-key` 和 `secret-key`

```bash
kubectl create secret generic alidns-secret --from-literal=access-key=YOUR_ACCESS_KEY --from-literal=secret-key=YOUR_SECRET_KEY -n cert-manager
```

1. 接下来同样首先创建一个 staging 环境的 DNS 类型的证书机构资源对象

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging-dns01
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: beilanzhisen@163.com
    privateKeySecretRef:
      name: letsencrypt-staging-dns01
    solvers:
    - dns01:   # ACME DNS-01 类型
        webhook:
          groupName: acme.yourcompany.com
          solverName: alidns
          config:
            region: ""
            accessKeySecretRef:  # 引用 ak
              name: alidns-secret
              key: access-key
            secretKeySecretRef:  # 引用 sk
              name: alidns-secret
              key: secret-key
```

接下来我们就可以使用上面的 ClusterIssuer 对象来或者证书数据了，创建如下所示的 Certificate 资源对象

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: qingyang-com-cert
spec:
  secretName: qingyang-com-tls
  commonName: "*.qingyang.com"
  dnsNames:
  - qingyang.com
  - "*.qingyang.com"
  issuerRef:
    name: letsencrypt-staging-dns01
    kind: ClusterIssuer
```

后我们就可以直接在 Ingress 资源对象中使用上面的 Secret 对象了

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: https-ingress
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-staging"  # 使用哪个issuer
spec:
  ingressClassName: nginx
  tls:
  - hosts:
      - "*.qingyang.com"
    secretName: qingyang-com-tls   # 用于存储证书的Secret对象名字
  rules:
  - host: demo.qingyang.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: vue-demo
            port: 
              number: 80
```