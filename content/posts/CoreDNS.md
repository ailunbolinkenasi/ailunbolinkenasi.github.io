---
title: CacheDNS和DNS缓存
tags:
  - kubernetes
  - coredns
categories:
  - kubernetes
description: 如果在集群规模较大并发较高的情况下我们仍然需要对 DNS 进行优化，典型的就是大家比较熟悉的 CoreDNS 会出现超时5s的情况。
images:
  - https://d33wubrfki0l68.cloudfront.net/bf8e5eaac697bac89c5b36a0edb8855c860bfb45/6944f/images/docs/nodelocaldns.svg
url: "kubernetes/nodelocaldns"
date: 2023-02-26 00:00:00
---
如果在集群规模较大并发较高的情况下我们仍然需要对 DNS 进行优化，典型的就是大家比较熟悉的 CoreDNS 会出现超时5s的情况。

## 超时原因

在 iptables 模式下（默认情况下），每个服务的 kube-proxy 在主机网络名称空间的 nat 表中创建一些 iptables 规则。 比如在集群中具有两个 DNS 服务器实例的 kube-dns 服务，其相关规则大致如下所示：

```bash
(1) -A PREROUTING -m comment --comment "kubernetes service portals" -j KUBE-SERVICES
<...>
(2) -A KUBE-SERVICES -d 10.96.0.10/32 -p udp -m comment --comment "kube-system/kube-dns:dns cluster IP" -m udp --dport 53 -j KUBE-SVC-TCOU7JCQXEZGVUNU
<...>
(3) -A KUBE-SVC-TCOU7JCQXEZGVUNU -m comment --comment "kube-system/kube-dns:dns" -m statistic --mode random --probability 0.50000000000 -j KUBE-SEP-LLLB6FGXBLX6PZF7
(4) -A KUBE-SVC-TCOU7JCQXEZGVUNU -m comment --comment "kube-system/kube-dns:dns" -j KUBE-SEP-LRVEW52VMYCOUSMZ
<...>
(5) -A KUBE-SEP-LLLB6FGXBLX6PZF7 -p udp -m comment --comment "kube-system/kube-dns:dns" -m udp -j DNAT --to-destination 10.32.0.6:53
<...>
(6) -A KUBE-SEP-LRVEW52VMYCOUSMZ -p udp -m comment --comment "kube-system/kube-dns:dns" -m udp -j DNAT --to-destination 10.32.0.7:53
```

我们知道每个 Pod 的 `/etc/resolv.conf` 文件中都有填充的 `nameserver 10.96.0.10` 这个条目。所以来自 Pod 的 DNS 查找请求将发送到 `10.96.0.10`，这是 kube-dns 服务的 ClusterIP 地址。 由于 `(1)` 请求进入 `KUBE-SERVICE` 链，然后匹配规则 `(2)`，最后根据 `(3)` 的 random 随机模式，跳转到 (5) 或 (6) 条目，将请求 UDP 数据包的目标 IP 地址修改为 DNS 服务器的`实际` IP 地址，这是通过 `DNAT` 完成的。其中 `10.32.0.6` 和 `10.32.0.7` 是我们集群中 CoreDNS 的两个 Pod 副本的 IP 地址。

## 内核中的DNAT

`DNAT` 的主要职责是同时更改传出数据包的目的地，响应数据包的源，并确保对所有后续数据包进行相同的修改。后者严重依赖于连接跟踪机制，也称为 `conntrack`，它被实现为内核模块。`conntrack` 会跟踪系统中正在进行的网络连接。

`conntrack` 中的每个连接都由两个元组表示，一个元组用于原始请求（IP_CT_DIR_ORIGINAL），另一个元组用于答复（IP_CT_DIR_REPLY）。对于 UDP，每个元组都由源 IP 地址，源端口以及目标 IP 地址和目标端口组成，答复元组包含存储在src 字段中的目标的真实地址。

例如，如果 IP 地址为 `10.40.0.17` 的 Pod 向 kube-dns 的 ClusterIP 发送一个请求，该请求被转换为 `10.32.0.6`，则将创建以下元组：

```bash
原始：src = 10.40.0.17 dst = 10.96.0.10 sport = 53378 dport = 53
回复：src = 10.32.0.6 dst = 10.40.0.17 sport = 53 dport = 53378
```

通过这些条目内核可以相应地修改任何相关数据包的目的地和源地址，而无需再次遍历 DNAT 规则，此外，它将知道如何修改回复以及应将回复发送给谁。创建 `conntrack` 条目后，将首先对其进行确认，然后如果没有已确认的 `conntrack` 条目具有相同的原始元组或回复元组，则内核将尝试确认该条目。

> 具体原因可以参考 weave works 总结的文章 [Racy conntrack and DNS lookup timeouts](https://www.weave.works/blog/racy-conntrack-and-dns-lookup-timeouts)

- 只有多个线程或进程，并发从同一个 socket 发送相同五元组的 UDP 报文时，才有一定概率会发生
- glibc、musl（alpine linux 的 libc 库）都使用 `parallel query`, 就是并发发出多个查询请求，因此很容易碰到这样的冲突，造成查询请求被丢弃
- 由于 ipvs 也使用了 conntrack, 使用 kube-proxy 的 ipvs 模式，并不能避免这个问题

### 解决方法

要彻底解决这个问题最好当然是内核上去 FIX 掉这个 BUG，除了这种方法之外我们还可以使用其他方法来进行规避，我们可以避免相同五元组 DNS请求的并发。

在 `resolv.conf` 中就有两个相关的参数可以进行配置：

- `single-request-reopen`：发送 A 类型请求和 AAAA 类型请求使用不同的源端口，这样两个请求在 conntrack 表中不占用同一个表项，从而避免冲突。
- `single-request`：避免并发，改为串行发送 A 类型和 AAAA 类型请求。没有了并发，从而也避免了冲突。

1. Pod 的 postStart hook 中添加

```yaml
lifecycle:
  postStart:
    exec:
      command:
      - /bin/sh
      - -c 
      - "/bin/echo 'options single-request-reopen' >> /etc/resolv.conf"
```

2. 使用 `template.spec.dnsConfig` 配置

```yaml
template:
  spec:
    dnsConfig:
      options:
        - name: single-request-reopen	
```

3. 使用 ConfigMap 覆盖 Pod 里面的 `/etc/resolv.conf`

```yaml
# configmap
apiVersion: v1
data:
  resolv.conf: |
    nameserver 1.2.3.4
    search default.svc.cluster.local svc.cluster.local cluster.local
    options ndots:5 single-request-reopen timeout:1
kind: ConfigMap
metadata:
  name: resolvconf
---
# Pod Spec
spec:
    volumeMounts:
    - name: resolv-conf
      mountPath: /etc/resolv.conf   
      subPath: resolv.conf  # 在某个目录下面挂载一个文件（保证不覆盖当前目录）需要使用subPath -> 不支持热更新
...
  volumes:
  - name: resolv-conf
    configMap:
      name: resolvconf
      items:
      - key: resolv.conf
        path: resolv.conf
```

## NodeLocal DNSCache

NodeLocal DNSCache 通过在集群节点上作为 DaemonSet 运行 DNS 缓存代理来提高集群 DNS 性能。 在当今的体系结构中，运行在 `ClusterFirst` DNS 模式下的 Pod 可以连接到 kube-dns `serviceIP` 进行 DNS 查询。 通过 kube-proxy 添加的 iptables 规则将其转换为 kube-dns/CoreDNS 端点。 借助这种新架构，Pod 将可以访问在同一节点上运行的 DNS 缓存代理，从而避免 iptables DNAT 规则和连接跟踪。 本地缓存代理将查询 kube-dns 服务以获取集群主机名的缓存缺失（默认为 “`cluster.local`” 后缀）。

### 动机

- 使用当前的 DNS 体系结构，如果没有本地 kube-dns/CoreDNS 实例，则具有最高 DNS QPS 的 Pod 可能必须延伸到另一个节点。 在这种场景下，拥有本地缓存将有助于改善延迟。
- 跳过 iptables DNAT 和连接跟踪将有助于减少 [conntrack 竞争](https://github.com/kubernetes/kubernetes/issues/56903)并避免 UDP DNS 条目填满 conntrack 表。
- 从本地缓存代理到 kube-dns 服务的连接可以升级为 TCP。 TCP conntrack 条目将在连接关闭时被删除，相反 UDP 条目必须超时 （[默认](https://www.kernel.org/doc/Documentation/networking/nf_conntrack-sysctl.txt) `nf_conntrack_udp_timeout` 是 30 秒）。
- 将 DNS 查询从 UDP 升级到 TCP 将减少由于被丢弃的 UDP 包和 DNS 超时而带来的尾部等待时间； 这类延时通常长达 30 秒（3 次重试 + 10 秒超时）。 由于 nodelocal 缓存监听 UDP DNS 查询，应用不需要变更。
- 在节点级别对 DNS 请求的度量和可见性。
- 可以重新启用负缓存，从而减少对 kube-dns 服务的查询数量。

工作原理如下

![NodeLocal DNSCache 流](https://d33wubrfki0l68.cloudfront.net/bf8e5eaac697bac89c5b36a0edb8855c860bfb45/6944f/images/docs/nodelocaldns.svg)

此图显示了 NodeLocal DNSCache 如何处理 DNS 查询

### 安装NodeLocalDNS

直接从官方的资源清单当中获取即可

- `image`：默认镜像国内是下载不了的请更换地址

```bash
wget https://github.com/kubernetes/kubernetes/blob/master/cluster/addons/dns/nodelocaldns/nodelocaldns.yaml
# 下载完成请更换image地址： registry.cn-beijing.aliyuncs.com/custom_img/k8s-dns-node-cache:1.22.18
```

注意资源清单中的几个变量信息

- `__PILLAR__DNS__SERVER__`：表示 kube-dns 这个 Service 的 ClusterIP。
- `__PILLAR__LOCAL__DNS__`: 表示 DNSCache 本地的 IP，默认为 `169.254.20.10`
- `__PILLAR__DNS__DOMAIN__`: 表示集群域，默认就是 `cluster.local`

```bash
# 通过以下命令进行获取
kubectl get svc kube-dns -n kube-system -o jsonpath={.spec.clusterIP}
# 修改部分变量信息
sed -i 's/__PILLAR__DNS__SERVER__/10.10.0.10/g
s/__PILLAR__LOCAL__DNS__/169.254.20.10/g
s/__PILLAR__DNS__DOMAIN__/cluster.local/g' nodelocaldns.yaml 
# 创建资源配置清单
kubectl apply -f nodelocaldns.yaml
```

- 如果 kube-proxy 运行在 IPVS 模式(因为我是`ipvs`的模式)

```bash
sed -i "s/__PILLAR__LOCAL__DNS__/$localdns/g; s/__PILLAR__DNS__DOMAIN__/$domain/g; s/,__PILLAR__DNS__SERVER__//g; s/__PILLAR__CLUSTER__DNS__/$kubedns/g" nodelocaldns.yaml
```

在此模式下，node-local-dns Pod 只会侦听 `<node-local-address>` 的地址。 node-local-dns 接口不能绑定 kube-dns 的集群 IP 地址，因为 IPVS 负载均衡使用的接口已经占用了该地址。 node-local-dns Pod 会设置 `__PILLAR__UPSTREAM__SERVERS__`。

查看Pod是否运行成功

```bash
[root@Online-Beijing-master1 ~]# kubectl get pods -n kube-system | grep node-local-dns
node-local-dns-578vf                             1/1     Running   0             5m23s
node-local-dns-5jhcl                             1/1     Running   0             5m23s
node-local-dns-8hz5j                             1/1     Running   0             5m23s
node-local-dns-ch44w                             1/1     Running   0             5m23s
node-local-dns-jbg2p                             1/1     Running   0             5m23s
node-local-dns-t92ww                             1/1     Running   0             5m23s
```

如果 kube-proxy 组件使用的是 ipvs 模式的话我们还需要修改 kubelet 的 `--cluster-dns` 参数，将其指向 `169.254.20.10`，Daemonset 会在每个节点创建一个网卡来绑这个 IP，Pod 向本节点这个 IP 发 DNS 请求，缓存没有命中的时候才会再代理到上游集群 DNS 进行查询。

> 如果担心线上环境修改 `--cluster-dns` 参数会产生影响，我们也可以直接在新部署的 Pod 中通过 dnsConfig 配置使用新的 localdns 的地址来进行解析。

1. 通过修改`--cluster-dns`实现

```bash
# 1. 首先查看当前的proxy模式
[root@Online-Beijing-master1 ~]# kubectl get cm kube-proxy -n kube-system -o yaml | grep mode
    mode: "ipvs"
sed -i 's/10.10.0.10/169.254.20.10/g' /var/lib/kubelet/config.yaml
systemctl daemon-reload && systemctl restart kubelet
```

2. Pod中通过dnsConfig配置使用localdns

```yaml
dnsConfig:
  nameservers:
    - 169.254.20.10
  searches:
    - default.svc.cluster.local
    - svc.cluster.local
    - cluster.local
  options:
    - name: ndots
      value: '3'
dnsPolicy: None
```

> 由于指定`nameservers`属于`append`操作，如果需要忽略原来的dns地址请使用`dnsPolicy: None`

## CoreDns的性能优化

1. 合理控制CoreDNS的副本数量

```bash
kubectl -n kube-system scale --replicas=10 deployment/coredns
```

2. 为 coredns 定义 HPA 自动扩缩容。
3. 安装 [cluster-proportional-autoscaler](https://github.com/kubernetes-sigs/cluster-proportional-autoscaler) 以实现更精确的扩缩容(推荐)。
4. 禁用IPv6

如果 K8S 节点没有禁用 IPV6 的话，容器内进程请求 coredns 时的默认行为是同时发起 IPV4 和 IPV6 解析，而通常我们只需要用到 IPV4，当容器请求某个域名时，coredns 解析不到 IPV6 记录，就会 forward 到 upstream 去解析，如果到 upstream 需要经过较长时间(比如跨公网，跨机房专线)，就会拖慢整个解析流程的速度，业务层面就会感知 DNS 解析慢。

```bash
kubectl edit cm coredns -n kube-system
```

Corefile中添加禁用IPv6

```yaml
apiVersion: v1
data:
  Corefile: |
    .:53 {
        errors
        health {
           lameduck 5s
        }
        # 添加此内容
        template ANY AAAA {
           rcode NXDOMAIN
        }
        ...
}
```

1. 优化ndots

默认情况下，Kubernetes 集群中的域名解析往往需要经过多次请求才能解析到。查看 pod 内 的 `/etc/resolv.conf` 可以知道 `ndots` 选项默认为 5

```bash
root@nginxv1-56f77cbc67-4v4fp:/# cat /etc/resolv.conf 
search default.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.10.0.10
options ndots:5
```

意思是: 如果域名中 `.` 的数量小于 5，就依次遍历 `search` 中的后缀并拼接上进行 DNS 查询。

举个例子，在 debug 命名空间查询 `kubernetes.default.svc.cluster.local` 这个 service:

1. 域名中有4个`.`小于5尝试拼接上第一个 search 进行查询,也就是查询即`kubernetes.default.svc.cluster.local.debug.svc.cluster.local`查不到该域名。
2. 继续尝试 `kubernetes.default.svc.cluster.local.svc.cluster.local`，查不到该域名。
3. 继续尝试 `kubernetes.default.svc.cluster.local.cluster.local`，仍然查不到该域名。
4. 尝试不加后缀，即 `kubernetes.default.svc.cluster.local`，查询成功，返回响应的 ClusterIP。

可以看到一个简单的 service 域名解析需要经过 4 轮解析才能成功，集群中充斥着大量无用的 DNS 请求。

我们可以设置较小的 ndots，在 Pod 的 `dnsConfig` 中可以设置

```yaml
spec:
  containers:
    - name: nginxv1
      image: nginx:latest
      resources: {}
      terminationMessagePath: /dev/termination-log
      terminationMessagePolicy: File
      imagePullPolicy: Always
      securityContext:
        privileged: false
  # 加入dnsConfig进行设置 
  dnsConfig:
    options: 
    - name: ndots
      value: "2"
```

然后业务发请求时尽量将 service 域名拼完整，这样就不会经过 search 拼接造成大量多余的 DNS 请求。

不过这样会比较麻烦，有没有更好的办法呢？有的！请看下面的 `autopath` 方式。

1. 启用autopath

启用 CoreDNS 的 autopath 插件可以避免每次域名解析经过多次请求才能解析到，原理是 CoreDNS 智能识别拼接过 search 的 DNS 解析，直接响应 CNAME 并附上相应的 ClusterIP，一步到位，可以极大减少集群内 DNS 请求数量。

```yaml
kubectl -n kube-system edit configmap coredns
{
  "Corefile": ".:53 {
        errors
        health {
           lameduck 5s
        }
        ready
        kubernetes cluster.local in-addr.arpa ip6.arpa {
           pods insecure # 修改为 pods verified
           fallthrough in-addr.arpa ip6.arpa
           ttl 30
        }
        autopath @kubernetes # 添加autopath @kubernetes
        prometheus :9153
        forward . /etc/resolv.conf {
           max_concurrent 1000
        }
        template ANY AAAA {
           rcode NXDOMAIN
        }
        cache 30
        loop
        reload
        loadbalance
    }
}
```

需要注意的是，启用 autopath 后，由于 coredns 需要 watch 所有的 pod，会增加 coredns 的内存消耗，根据情况适当调节 coredns 的 `memory request` 和 limit。

- 有兴趣的可以去看看这篇文章：[详解DNS和CoreDNS](https://draveness.me/dns-coredns/)