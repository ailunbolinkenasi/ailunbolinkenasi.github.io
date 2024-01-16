---
title: kubernetes-Service解读
tags:
  - kubernetes
categories:
  - kubernetes
description: >-
  Service 是一种抽象的对象，它定义了一组 Pod 的逻辑集合和一个用于访问它们的策略，其实这个概念和微服务非常类似。一个 Serivce 下面包含的
  Pod 集合是由 Label Selector 来决定的。
images:
  - https://fc.sinaimg.cn/large/005Czbxjgy1hlm862knaqj30sg0e875n.jpg
url: "kubernetes/ServiceReader"
date: 2020-04-13 00:00:00
---

# Service的简单理解

Service 是一种抽象的对象，它定义了一组 Pod 的逻辑集合和一个用于访问它们的策略，其实这个概念和微服务非常类似。一个 Serivce 下面包含的 Pod 集合是由 Label Selector 来决定的。

假如我们后端运行了3个副本，这些副本都是可以替代的，因为前端并不关心它们使用的是哪一个后端服务。尽管由于各种原因后端的 Pod 集合会发送变化，但是前端却不需要知道这些变化，也不需要自己用一个列表来记录这些后端的服务，Service 的这种抽象就可以帮我们达到这种解耦的目的。

## 三种IP

在继续往下学习 Service 之前，我们需要先弄明白 Kubernetes 系统中的三种IP，因为经常有同学混乱。

- NodeIP：Node 节点的 IP 地址
- PodIP: Pod 的 IP 地址
- ClusterIP: Service 的 IP 地址

首先，NodeIP是Kubernetes集群中节点的物理网卡IP地址(一般为内网)，所有属于这个网络的服务器之间都可以直接通信，所以Kubernetes集群外要想访问Kubernetes集群内部的某个节点或者服务，肯定得通过Node P进行通信（这个时候一般是通过外网 IP 了）

然后PodIP是每个Pod的IP地址，它是网络插件进行分配的，前面我们已经讲解过

最后ClusterIP是一个虚拟的IP，仅仅作用于Kubernetes Service 这个对象，由Kubernetes自己来进行管理和分配地址。

## 定义Servcie

定义 Service 的方式和我们前面定义的各种资源对象的方式类型，例如，假定我们有一组 Pod 服务，它们对外暴露了 8080 端口，同时都被打上了 app=beijing-nginx 这样的标签，那么我们就可以像下面这样来定义一个 Service 对象

```
apiVersion: v1
kind: Service
metadata:
  name: public-beijing-nginx-service
spec:
  selector:
    app: beijing-nginx
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80 # 可以理解成是service的访问端口
    name: beijing-nginx-http
```

然后通过的使用 `kubectl create -f myservice.yaml` 就可以创建一个名为 myservice 的 Service 对象，它会将请求代理到使用 TCP 端口为 80，具有标签 `app=beijing-nginx-http` 的 Pod 上，这个 Service 会被系统分配一个我们上面说的 Cluster IP，该 Service 还会持续的监听 selector 下面的 Pod，会把这些 Pod 信息更新到一个名为 myservice 的Endpoints 对象上去，这个对象就类似于我们上面说的 Pod 集合了。

需要注意的是，Service 能够将一个接收端口映射到任意的 targetPort。默认情况下，targetPort 将被设置为与 port 字段相同的值。可能更有趣的是，targetPort 可以是一个字符串，引用了 backend Pod 的一个端口的名称。因实际指派给该端口名称的端口号，在每个 backend Pod 中可能并不相同，所以对于部署和设计 Service，这种方式会提供更大的灵活性。

另外 Service 能够支持 TCP 和 UDP 协议，默认是 TCP 协议。

## kube-proxy

前面我们讲到过，在 Kubernetes 集群中，每个 Node 会运行一个 kube-proxy 进程, 负责为 Service 实现一种 VIP（虚拟 IP，就是我们上面说的 clusterIP）的代理形式，现在的 Kubernetes 中默认是使用的 iptables 这种模式来代理。

### iptables

这种模式，kube-proxy 会 watch apiserver 对 Service 对象和 Endpoints 对象的添加和移除。对每个 Service，它会添加上 iptables 规则，从而捕获到达该 Service 的 clusterIP（虚拟 IP）和端口的请求，进而将请求重定向到 Service 的一组 backend 中的某一个 Pod 上面。我们还可以使用 `Pod readiness 探针` 验证后端 Pod 可以正常工作，以便 iptables 模式下的 kube-proxy 仅看到测试正常的后端，这样做意味着可以避免将流量通过 `kube-proxy` 发送到已知失败的 Pod 中，所以对于线上的应用来说一定要做 readiness 探针。

![img](https://d33wubrfki0l68.cloudfront.net/86c9416a1c3e7cef4b941c250c1ec49eef19bb9a/069f9/images/docs/services-iptables-overview.svg)

ptables 模式的 kube-proxy 默认的策略是，随机选择一个后端 Pod。

比如当创建 backend Service 时，Kubernetes 会给它指派一个虚拟 IP 地址，比如 10.0.0.1。假设 Service 的端口是 1234，该 Service 会被集群中所有的 kube-proxy 实例观察到。当 kube-proxy 看到一个新的 Service，它会安装一系列的 iptables 规则，从 VIP 重定向到 `per-Service` 规则。 该 `per-Service` 规则连接到 `per-Endpoint` 规则，该 `per-Endpoint` 规则会重定向（目标 `NAT`）到后端的 Pod。

#### 优化iptables模式性能

在大型集群（有数万个 Pod 和 Service）中，当 Service（或其 EndpointSlices）发生变化时 iptables 模式的 kube-proxy 在更新内核中的规则时可能要用较长时间。 你可以通过修改`kube-proxy`的`ConfigMap`中的选项来调整 kube-proxy 的同步行为：

```
iptables:
  minSyncPeriod: 1s
  syncPeriod: 30s
```

- minSyncPeriod: 参数设置尝试同步 iptables 规则与内核之间的最短时长。如果是 `0s`，那么每次有任一 Service 或 Endpoint 发生变更时，kube-proxy 都会立即同步这些规则。 这种方式在较小的集群中可以工作得很好，但如果在很短的时间内很多东西发生变更时，它会导致大量冗余工作。 例如，如果你有一个由 Deployment 支持的 Service，共有 100 个 Pod，你删除了这个 Deployment， 且设置了 `minSyncPeriod: 0s`，kube-proxy 最终会从 iptables 规则中逐个删除 Service 的 Endpoint， 总共更新 100 次。使用较大的 `minSyncPeriod` 值时，多个 Pod 删除事件将被聚合在一起， 因此 kube-proxy 最终可能会进行例如 5 次更新，每次移除 20 个端点， 这样在 CPU 利用率方面更有效率，能够更快地同步所有变更。

> 默认值 `1s` 对于中小型集群是一个很好的折衷方案。 在大型集群中，可能需要将其设置为更大的值。 （特别是，如果 kube-proxy 的 `sync_proxy_rules_duration_seconds` 指标表明平均时间远大于 1 秒， 那么提高 `minSyncPeriod` 可能会使更新更有效率。）

- `syncPeriod`: 参数控制与单次 Service 和 Endpoint 的变更没有直接关系的少数同步操作。 特别是，它控制 kube-proxy 在外部组件已干涉 kube-proxy 的 iptables 规则时通知的速度。 在大型集群中，kube-proxy 也仅在每隔 `syncPeriod` 时长执行某些清理操作，以避免不必要的工作。

### IPVS

在 `ipvs` 模式下，kube-proxy 监视 Kubernetes Service 和 EndpointSlice， 然后调用 `netlink` 接口创建 IPVS 规则， 并定期与 Kubernetes Service 和 EndpointSlice 同步 IPVS 规则。 该控制回路确保 IPVS 状态与期望的状态保持一致。 访问 Service 时，IPVS 会将流量导向到某一个后端 Pod。

IPVS 代理模式基于 netfilter 回调函数，类似于 iptables 模式， 但它使用哈希表作为底层数据结构，在内核空间中生效。 这意味着 IPVS 模式下的 kube-proxy 比 iptables 模式下的 kube-proxy 重定向流量的延迟更低，同步代理规则时性能也更好。 与其他代理模式相比，IPVS 模式还支持更高的网络流量吞吐量。

IPVS 提供了更多选项来平衡后端 Pod 的流量，默认是 `rr`，有如下一些策略：

- rr: 轮询
- lc: 最少连接（打开连接数最少）
- dh: 目标地址哈希
- sh: 源地址哈希
- sed: 最短预期延迟
- nq:最少队列

![img](https://d33wubrfki0l68.cloudfront.net/5cf236cbe0fecd3dfa46f6c648fc732c3ff06bf5/33f79/images/docs/services-ipvs-overview.svg)

不过现在只能整体修改策略，可以通过 kube-proxy 中配置 `–ipvs-scheduler` 参数来实现，暂时不支持特定的 Service 进行配置。

开启`ipvs`模块

```bash
modprobe -- ip_vs
modprobe -- ip_vs_rr
modprobe -- ip_vs_wrr
modprobe -- ip_vs_sh
modprobe -- nf_conntrack_ipv4
yum install ipvsadm ipset -y
```

修改`kube-proxy`的`configMap`

```bash
kubectl edit configmap kube-proxy -n kube-system
# 修改mode为"ipvs"
   minSyncPeriod: 0s
      scheduler: ""
      syncPeriod: 30s
    kind: KubeProxyConfiguration
    metricsBindAddress: 127.0.0.1:10249
    mode: "ipvs"                          # 修改此处
    nodePortAddresses: null
```

> 修改完成后记得重启`kube-proxy`，然后使用`ipvsadm -ln`校验。正常可以出现很多的规则链条。

#### 会话亲和性

在这些代理模型中，绑定到 `Service IP:Port` 的流量被代理到合适的后端， 客户端不需要知道任何关于 Kubernetes、Service 或 Pod 的信息。

如果要确保来自特定客户端的连接每次都传递给同一个 Pod， 你可以通过设置 Service 的 `.spec.sessionAffinity` 为 `ClientIP` 来设置基于客户端 IP 地址的会话亲和性（默认为 `None`）。

```yaml
apiVersion: v1
kind: Service
metadata:
  name: demo
spec:
  sessionAffinity: ClientIP
```

### 会话超时

你还可以通过设置 Service 的 `.spec.sessionAffinityConfig.clientIP.timeoutSeconds` 来设置最大会话粘性时间（默认值为 10800，即 3 小时）。

```yaml
apiVersion: v1
kind: Service
metadata:
  name: demo
spec:
  sessionAffinityConfig:
    clientIP:
      imeoutSeconds: 10800
```

## Service

将运行在一组 [Pods](https://kubernetes.io/zh-cn/docs/concepts/workloads/pods/) 上的应用程序公开为网络服务的抽象方法。

使用 Kubernetes，你无需修改应用程序去使用不熟悉的服务发现机制。 Kubernetes 为 Pod 提供自己的 IP 地址，并为一组 Pod 提供相同的 DNS 名， 并且可以在它们之间进行负载均衡。

Kubernetes `ServiceTypes` 允许指定你所需要的 Service 类型。

- `ClusterIP`：通过集群的内部 IP 暴露服务，选择该值时服务只能够在集群内部访问。 这也是你没有为服务显式指定 `type` 时使用的默认值。 你可以使用 [Ingress](https://kubernetes.io/zh-cn/docs/concepts/services-networking/ingress/) 或者 [Gateway API](https://gateway-api.sigs.k8s.io/) 向公众暴露服务。
- NodePort： 通过每个节点上的 IP 和静态端口（`NodePort`）暴露服务。 为了让节点端口可用，Kubernetes 设置了集群 IP 地址，这等同于你请求 `type: ClusterIP` 的服务。
- LoadBalancer：使用云提供商的负载均衡器向外部暴露服务。 外部负载均衡器可以将流量路由到自动创建的 `NodePort` 服务和 `ClusterIP` 服务上。
- ExternalName：通过返回 `CNAME` 记录和对应值，可以将服务映射到 `externalName` 字段的内容（例如，`foo.bar.example.com`）。 无需创建任何类型代理。

### NodePort

如果你将 `type` 字段设置为 `NodePort`，则 Kubernetes 控制平面将在 `--service-node-port-range` 标志指定的范围内分配端口（默认值：30000-32767）。 每个节点将那个端口（每个节点上的相同端口号）代理到你的服务中。 你的服务在其 `.spec.ports[*].nodePort` 字段中报告已分配的端口。

使用 NodePort 可以让你自由设置自己的负载均衡解决方案， 配置 Kubernetes 不完全支持的环境， 甚至直接暴露一个或多个节点的 IP 地址。

对于 NodePort 服务，Kubernetes 额外分配一个端口（TCP、UDP 或 SCTP 以匹配服务的协议）。 集群中的每个节点都将自己配置为监听分配的端口并将流量转发到与该服务关联的某个就绪端点。 通过使用适当的协议（例如 TCP）和适当的端口（分配给该服务）连接到所有节点， 你将能够从集群外部使用 `type: NodePort` 服务。

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  type: NodePort
  selector:
    app.kubernetes.io/name: MyApp
  ports:
    # 默认情况下，为了方便起见，`targetPort` 被设置为与 `port` 字段相同的值。
    - port: 80
      targetPort: 80
      # 可选字段
      # 默认情况下，为了方便起见，Kubernetes 控制平面会从某个范围内分配一个端口号（默认：30000-32767）
      nodePort: 30007
```

### LoadBalancer

在使用支持外部负载均衡器的云提供商的服务时，设置 `type` 的值为 `"LoadBalancer"`， 将为 Service 提供负载均衡器。 负载均衡器是异步创建的，关于被提供的负载均衡器的信息将会通过 Service 的 `status.loadBalancer` 字段发布出去。

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app.kubernetes.io/name: MyApp
  ports:
    - protocol: TCP
      port: 80
      targetPort: 9376
  clusterIP: 10.0.171.239
  type: LoadBalancer
status:
  loadBalancer:
    ingress:
    - ip: 192.0.2.127
```

自外部负载均衡器的流量将直接重定向到后端 Pod 上，不过实际它们是如何工作的，这要依赖于云提供商。

某些云提供商允许设置 `loadBalancerIP`。 在这些情况下，将根据用户设置的 `loadBalancerIP` 来创建负载均衡器。 如果没有设置 `loadBalancerIP` 字段，将会给负载均衡器指派一个临时 IP。 如果设置了 `loadBalancerIP`，但云提供商并不支持这种特性，那么设置的 `loadBalancerIP` 值将会被忽略掉。

要实现 `type: LoadBalancer` 的服务，Kubernetes 通常首先进行与请求 `type: NodePort` 服务等效的更改。 cloud-controller-manager 组件然后配置外部负载均衡器以将流量转发到已分配的节点端口。

### ExternalName

类型为 ExternalName 的服务将服务映射到 DNS 名称，而不是典型的选择算符，例如 `my-service` 或者 `cassandra`。 你可以使用 `spec.externalName` 参数指定这些服务。

例如，以下 Service 定义将 `prod` 名称空间中的 `my-service` 服务映射到 `my.database.example.com`

```
apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: prod
spec:
  type: ExternalName
  externalName: my.database.example.com
```

### 自定义Service

假设我们的etcd集群在外部，我们想要通过`Service`进行访问，我们可以进行自定义的`Service`。

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  type: ClusterIP
  ClusterIP: None
  ports:
  - name: etcd-port
    port: 2379
---
apiVersion: v1
kind: Endpoints
metadata:
  name: custom-etcd-svc
subsets:
- address:
  - ip: 10.151.30.11
  ports:
      - name: etcd-port
        port: 2379
```

## 获取客户端IP

通常，当集群内的客户端连接到服务的时候，是支持服务的 Pod 可以获取到客户端的 IP 地址的，但是，当通过节点端口接收到连接时，由于对数据包执行了源网络地址转换（SNAT），因此数据包的源 IP 地址会发生变化，后端的 Pod 无法看到实际的客户端 IP，对于某些应用来说是个问题，比如，nginx 的请求日志就无法获取准确的客户端访问 IP 了。

假设我们现在有一组`nginx`集群服务，当我从`10.1.6.48`进行访问的时候我们可以看一下最终呈现给我们的地址

```log
10.10.207.192 - - [23/Feb/2023:06:09:24 +0000] "GET / HTTP/1.1" 200 615 "-" "curl/7.61.1" "-"
10.10.207.192 - - [23/Feb/2023:06:10:50 +0000] "GET / HTTP/1.1" 200 615 "-" "curl/7.61.1" "-"
10.10.207.192 - - [23/Feb/2023:06:10:52 +0000] "GET / HTTP/1.1" 200 615 "-" "curl/7.61.1" "-"
10.10.207.192 - - [23/Feb/2023:06:10:53 +0000] "GET / HTTP/1.1" 200 615 "-" "curl/7.61.1" "-"
```

正常来说我得到的应该是客户端的真实IP地址，而我现在得到的却是`tunl0@NONE`的IP地址

这个时候我们可以在 Service 设置 `externalTrafficPolicy` 来减少网络跳数

```yaml
kind: Service
apiVersion: v1
metadata:
  name: public-beijing-nginx-service
  namespace: default
spec:
  externalTrafficPolicy: Local
  ports:
    - name: beijing-nginx-http
      protocol: TCP
      port: 80
      targetPort: 80
  selector:
    app: beijing-nginx
  type: ClusterIP
  sessionAffinity: ClusterIP
  ipFamilies:
    - IPv4
  ipFamilyPolicy: SingleStack
  internalTrafficPolicy: Cluster
status:
  loadBalancer: {}
```

但这可能导致流量分配不均。 没有针对特定 LoadBalancer 服务的任何 Pod 的节点将无法通过自动分配的 `.spec.healthCheckNodePort` 进行 NLB 目标组的运行状况检查，并且不会收到任何流量。