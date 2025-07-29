---
title: kubernetes-Scheduler简单详解
tags:
  - kubernetes
categories:
  - kubernetes
description: kube-scheduler 是 kubernetes 的核心组件之一
heroImage:  {
    src: 'https://img14.360buyimg.com/ddimg/jfs/t1/164569/9/40677/14419/65bc6e4cFa1d8c0c3/5ccf7e6caadc9b83.jpg',
    inferSize: true
}
publishDate: 2020-03-14 00:00:00
slug: "/tech/kubernetes/kube-schdeduler"
---
`kube-scheduler` 是 kubernetes 的核心组件之一，主要负责整个集群资源的调度功能，根据特定的调度算法和策略，将 Pod 调度到最优的工作节点上面去，从而更加合理、更加充分的利用集群的资源，这也是我们选择使用 kubernetes 一个非常重要的理由。如果一门新的技术不能帮助企业节约成本、提供效率，我相信是很难推进的。

## 调度流程

`kube-scheduler` 提供的默认调度器能够满足我们绝大多数的要求，我们前面和大家接触的示例也基本上用的默认的策略，都可以保证我们的 Pod 可以被分配到资源充足的节点上运行。但是在实际的线上项目中，可能我们自己会比 kubernetes 更加了解我们自己的应用，比如我们希望一个 Pod 只能运行在特定的几个节点上，或者这几个节点只能用来运行特定类型的应用，这就需要我们的调度器能够可控。

1. 发起创建`Deployment`请求->`API Server`,这个时候`APIServer`会进行一系列的逻辑处理,例如: 鉴权、查看你是否有权限操作、Deployment创建是否合法等等,然后将请求存储到etcd当中并且转发给`Controller Manager`
2. `Controller Manager`会监听`API Server`,这个时候假设监听到的是一个创建`Deployment`的请求,则会把请求转发到`Deployment Controller`
3. `Deployment Controller`接受到请求后创建`ReplicaSet`,然后`ReplicaSet Controller`会根据`yaml`当中定义的`template`模板来进行创建Pod,然后返回给`API Server`
4. 在创建之初的Pod属性中`nodeName`为空,也就是没有被调度过的,这个时候调度器就会对它进行调度,调度去watchPod对象,然后分析那个节点最适合这个Pod,然后将节点的名字通过类似于bind的这种方法写入到`nodeName`当中。
5. 然后该节点的kubelet会进行一系列的判断,然后进入Create Pod的流程,然后进行一系列的`CNI`和`CSI`的过程。

> 这也就是我们常说的往往越简单的东西,背后实现的越复杂。

### 调度阶段

`kube-scheduler`调度分为两个阶段

1. `predicate`: 过滤阶段，过滤不符合条件的节点。
2. `priority`: 优先级排序，选择优先级最高的节点，也就是给节点打分。

### Predicates策略

1. `PodFitsHostPorts`: 检查是否有Host Ports冲突
2. `PodFitsPorts`: 同上
3. `PodFitsResources`: 检查Node的资源是否充足，包括允许的Pod数量、CPU、内存、GPU个数以及其他的OpaqueIntResources。
4. `HostName`:检查`pod.Spec.NodeName`是否与候选节点一致
5. `MatchNodeSelector`:检查候选节点的`pod.Spec.NodeSelector`是否匹配
6. `NoVolumeZoneConflict`:检查`volume zone`是否冲突

### Priority策略

1. `SelectorSpreadPriority`: 优先减少节点上属于同一个`Service`或`Replication Controller`的Pod数量。
2. `InterPodAffinityPriority`: 优先将Pod调度到相同的拓扑上
3. `LeastRequestedPriority`:优先调度到请求资源少的节点上
4. `BalancedResourceAllocation`: 优先平衡各节点的资源使用
5. `NodePreferAvoidPodsPriority`:权重判断

> 太多了可以自己去官网了解一下，这些策略都可以通过`scheduler`配置文件去配置，其实一般来说我们不太需要，我觉得kubernetes的调度是最让我们省心的。

## 资源需求

- `requests`:属于调度器调度的时候所参考的指标，也就是说我这个应用最少需要`250m`的cpu和`256m`的内存才能运行。

```yaml
kind: Deployment
apiVersion: apps/v1
metadata:
  name: nginx-deployment
  namespace: default
  labels:
    app: nginx
    version: qa
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx
      version: qa
  template:
    metadata:
      creationTimestamp: null
      labels:
        app: nginx
        version: qa
    spec:
      volumes:
        - name: host-time
          hostPath:
            path: /etc/localtime
            type: ''
      containers:
        - name: nginx
          image: nginx:latest
          ports:
            - name: http-web
              containerPort: 80
              protocol: TCP
          resources:
            limits:
              cpu: '1'
              memory: 2Gi
            requests:
              cpu: 250m
              memory: 256Mi
```

可以查看你节点的一些资源状态

```yaml
[root@master1 ~]# kubectl get nodes -o yaml
allocatable:
  cpu: 15600m
  ephemeral-storage: 104278276Ki
  hugepages-1Gi: "0"
  hugepages-2Mi: "0"
  memory: "38390677064"
  pods: "330"
capacity:
  cpu: "16"
  ephemeral-storage: 104278276Ki
  hugepages-1Gi: "0"
  hugepages-2Mi: "0"
  memory: 40003048Ki
  pods: "330"
```

可以看看这个`deployment`运行以后我们的`cgroup`对他做了如何的限制

```yaml
"CgroupParent": "/kubepods/burstable/pod1ceee26d-2ec2-43a8-96ef-5aa9ac99779b"
```

进入这个目录

```bash
[root@node1 ~]# cd /sys/fs/cgroup/cpu/kubepods/burstable/pod1ceee26d-2ec2-43a8-96ef-5aa9ac99779b
[root@node1 pod1ceee26d-2ec2-43a8-96ef-5aa9ac99779b]# cat cpu.shares 
358
```

> kubernetes对于不同的QOS的处理方式是不一样的。

### Limit-range

一个 **LimitRange（限制范围）** 对象提供的限制能够做到：

- 在一个命名空间中实施对每个 Pod 或 Container 最小和最大的资源使用量的限制。
- 在一个命名空间中实施对每个 [PersistentVolumeClaim](https://kubernetes.io/zh-cn/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims) 能申请的最小和最大的存储空间大小的限制。
- 在一个命名空间中实施对一种资源的申请值和限制值的比值的控制。
- 设置一个命名空间中对计算资源的默认申请/限制值，并且自动的在运行时注入到多个 Container 中。

当某命名空间中有一个 LimitRange 对象时，将在该命名空间中实施 LimitRange 限制。

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: cpu-resource-constraint
spec:
  limits:
  - default: # 此处定义默认限制值
      cpu: 500m
    defaultRequest: # 此处定义默认请求值
      cpu: 500m
    max: # max 和 min 定义限制范围
      cpu: "1"
    min:
      cpu: 100m
    type: Container
```

> 这东西其实是不太常用的

## 生产环境需要考虑的问题

- 是否公平调度
- 资源是否高效利用
- QOS
- `affinity`和`anti-affinity`
- 数据本地化
- 内部负载干扰(inter-workload interference)
- `deadlines`