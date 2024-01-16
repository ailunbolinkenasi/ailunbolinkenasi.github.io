---
title: Kubernetes-本地存储
tags:
  - kubernetes
categories:
  - kubernetes
description: 前面我们有通过 hostPath 或者 emptyDir 的方式来持久化我们的数据
images:
  - https://fc.sinaimg.cn/large/005Czbxjgy1hlm862knaqj30sg0e875n.jpg
date: 2023-03-22 00:00:00
url: "kubernetes/localstorage"
---

# 本地存储

前面我们有通过 `hostPath` 或者 `emptyDir` 的方式来持久化我们的数据，但是显然我们还需要更加可靠的存储来保存应用的持久化数据，这样容器在重建后，依然可以使用之前的数据。但是存储资源和 CPU 资源以及内存资源有很大不同，为了屏蔽底层的技术实现细节，让用户更加方便的使用，Kubernetes 便引入了 `PV` 和 `PVC` 两个重要的资源对象来实现对存储的管理。



## PersistentVolume

`PV` 的全称是：`PersistentVolume`（持久化卷），是对底层共享存储的一种抽象，PV 由管理员进行创建和配置，它和具体的底层的共享存储技术的实现方式有关，比如 `Ceph`、`GlusterFS`、`NFS`、`hostPath` 等，都是通过插件机制完成与共享存储的对接。

## PersistentVolumeClaim

`PVC` 的全称是：`PersistentVolumeClaim`（持久化卷声明），PVC 是用户存储的一种声明，PVC 和 Pod 比较类似，Pod 消耗的是节点，PVC 消耗的是 PV 资源，Pod 可以请求 CPU 和内存，而 PVC 可以请求特定的存储空间和访问模式。对于真正使用存储的用户不需要关心底层的存储实现细节，只需要直接使用 PVC 即可。

但是通过 PVC 请求到一定的存储空间也很有可能不足以满足应用对于存储设备的各种需求，而且不同的应用程序对于存储性能的要求可能也不尽相同，比如读写速度、并发性能等，为了解决这一问题，Kubernetes 又为我们引入了一个新的资源对象：`StorageClass`，通过 `StorageClass` 的定义，管理员可以将存储资源定义为某种类型的资源，比如快速存储、慢速存储等，用户根据 `StorageClass` 的描述就可以非常直观的知道各种存储资源的具体特性了，这样就可以根据应用的特性去申请合适的存储资源了，此外 `StorageClass` 还可以为我们自动生成 PV，免去了每次手动创建的麻烦。

## HostPath

我们上面提到了 PV 是对底层存储技术的一种抽象，PV 一般都是由管理员来创建和配置的，我们首先来创建一个 `hostPath` 类型的 `PersistentVolume`。Kubernetes 支持 `hostPath` 类型的 `PersistentVolume` 使用节点上的文件或目录来模拟附带网络的存储，但是需要注意的是在生产集群中，我们不会使用 `hostPath`，集群管理员会提供网络存储资源，比如 `NFS` 共享卷或 `Ceph` 存储卷，集群管理员还可以使用 `StorageClasses` 来设置动态提供存储。因为 Pod 并不是始终固定在某个节点上面的，所以要使用 hostPath 的话我们就需要将 Pod 固定在某个节点上，这样显然就大大降低了应用的容错性。

> 当然了，生产环境中用的还是相对较少因为有较少的需求需要将Pod来固定到某些节点上。

### 创建PersistentVolume

1. 假设我们现在在节点1上新建一个`/data/hostPath/index.html`

```bash
[root@Online-Beijing-node1 ~]# echo "Hello This is new hostPath message." >> /data/hostPath/index.html
```

1. 接下来创建一个Pv对象

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: demo-hostpath
  labels:
    type: local
spec:
  capacity: # 定义该Pv的容量为10Gb
    storage: 10Gi
  accessModes:  # 定义该Pv的访问模式
    - ReadWriteOnce
  hostPath:
    path: "/data/hostPath"
  storageClassName: type-ssd-sc
```

- Capacity（存储能力）：一般来说，一个 PV 对象都要指定一个存储能力，通过 PV 的 `capacity` 属性来设置的，目前只支持存储空间的设置，就是我们这里的 `storage=10Gi`，不过未来可能会加入 `IOPS`、吞吐量等指标的配置。
- AccessModes（访问模式）：用来对 PV 进行访问模式的设置，用于描述用户应用对存储资源的访问权限，访问权限包括下面几种方式：
  - ReadWriteOnce（RWO）：读写权限，但是只能被单个节点挂载
  - ReadOnlyMany（ROX）：只读权限，可以被多个节点挂载
  - ReadWriteMany（RWX）：读写权限，可以被多个节点挂载

创建完成后查看 PersistentVolume 的信息，输出结果显示该 `PersistentVolume` 的状态（STATUS） 为 `Available`。 这意味着它还没有被绑定给 `PersistentVolumeClaim`

```bash
[root@Online-Beijing-master1 ~]# kubectl get pv
NAME            CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS      CLAIM   STORAGECLASS   REASON   AGE
demo-hostpath   10Gi       RWO            Retain           Available           type-ssd-sc             13m
```

其中有一项 `RECLAIM POLICY` 的配置，同样我们可以通过 PV 的 `persistentVolumeReclaimPolicy`（回收策略）属性来进行配置，目前 PV 支持的策略有三种：

- Retain（保留）：回收策略 `Retain` 使得用户可以手动回收资源。当 `PersistentVolumeClaim` 对象被删除时，`PersistentVolume` 卷仍然存在，对应的数据卷被视为"已释放（released）"。 由于卷上仍然存在这前一申领人的数据，该卷还不能用于其他申领。 管理员可以通过下面的步骤来手动回收该卷：
  - 删除 PersistentVolume 对象。与之相关的、位于外部基础设施中的存储资产 （例如 AWS EBS、GCE PD、Azure Disk 或 Cinder 卷）在 PV 删除之后仍然存在。
  - 根据情况，手动清除所关联的存储资产上的数据。
  - 手动删除所关联的存储资产。
- Recycle（回收）：回收策略 `Recycle` 已被废弃。取而代之的建议方案是使用动态制备。如果下层的卷插件支持，回收策略 `Recycle` 会在卷上执行一些基本的擦除 （`rm -rf /thevolume/*`）操作，之后允许该卷用于新的 PVC 申领。
- Delete（删除）：对于支持 `Delete` 回收策略的卷插件，删除动作会将 `PersistentVolume` 对象从 Kubernetes 中移除，同时也会从外部基础设施（如 AWS EBS、GCE PD、Azure Disk 或 Cinder 卷）中移除所关联的存储资产。

目前，仅 NFS 和 HostPath 支持回收（Recycle）。 AWS EBS、GCE PD、Azure Disk 和 Cinder 卷都支持删除（Delete）。

> 不过需要注意的是，目前只有 `NFS` 和 `HostPath` 两种类型支持回收策略，当然一般来说还是设置为 `Retain` 这种策略保险一点。

关于 PV 的状态，实际上描述的是 PV 的生命周期的某个阶段，一个 PV 的生命周期中，可能会处于4种不同的阶段：

- Available（可用）：表示可用状态，还未被任何 PVC 绑定
- Bound（已绑定）：表示 PVC 已经被 PVC 绑定
- Released（已释放）：PVC 被删除，但是资源还未被集群重新声明
- Failed（失败）： 表示该 PV 的自动回收失败

### 创建PersistentVolumeClaim

如果我们需要使用这个 PV 的话，就需要创建一个对应的 PVC 来和他进行绑定了，就类似于我们的服务是通过 Pod 来运行的，而不是 Node，只是 Pod 跑在 Node 上而已。

让我们申请一个使用3G空间的`PersistentVolumeClaim`

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: task-pv-claim
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 3Gi
  storageClassName: type-ssd-sc
```

创建 `PersistentVolumeClaim` 之后，Kubernetes 控制平面将查找满足申领要求的 `PersistentVolume`。 如果控制平面找到具有相同 `StorageClass` 的适当的 `PersistentVolume`， 则将 `PersistentVolumeClaim` 绑定到该 `PersistentVolume` 上。所以再次`kubectl get pv`的`PersistentVolume`状态应该属于`Bound`状态。

```bash
[root@Online-Beijing-master1 yaml]# kubectl get pv
NAME            CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                   STORAGECLASS   REASON   AGE
demo-hostpath   10Gi       RWO            Retain           Bound    default/task-pv-claim   type-ssd-sc             47m

[root@Online-Beijing-master1 yaml]# kubectl get pvc
NAME            STATUS   VOLUME          CAPACITY   ACCESS MODES   STORAGECLASS   AGE
task-pv-claim   Bound    demo-hostpath   10Gi       RWO            type-ssd-sc    18m
```

可以看到已经绑定到了一个`Volume`叫做`demo-hostpath`的`PersistentVolume`

> 需要注意的是目前`PersistentVolume`和`PersistentVolumeClaim`之间是一对一绑定的关系，也就是说一个`PersistentVolume`只能被一个`PersistentVolumeClaim`绑定。

### 创建一个Deployment

创建一个`deployment`然后绑定`PersistentVolumeClaim`紧接着固定节点到`online-beijing-node1`

```
---
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    k8s.kuboard.cn/name: task-nginx-demo
  name: task-nginx-demo
  namespace: default
spec:
  progressDeadlineSeconds: 600
  replicas: 1
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      k8s.kuboard.cn/name: task-nginx-demo
  strategy:
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 25%
    type: RollingUpdate
  template:
    metadata:
      creationTimestamp: null
      labels:
        k8s.kuboard.cn/name: task-nginx-demo
    nodeSelector:
      kubernetes.io/hostname: online-beijing-node1
    spec:
      containers:
        - image: 'nginx:latest'
          imagePullPolicy: Always
          name: task-nginx-demo
          ports:
            - containerPort: 80
              hostPort: 80
              name: http
              protocol: TCP
          resources: {}
          terminationMessagePath: /dev/termination-log
          terminationMessagePolicy: File
          volumeMounts:
          - mountPath: "/usr/share/nginx/html"
            name: task-hostpath-volume
      dnsPolicy: ClusterFirst
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext: {}
      terminationGracePeriodSeconds: 30
      volumes:
      - name: task-hostpath-volume
        persistentVolumeClaim:
          claimName: task-pv-claim
```

当这个`deployment`创建完成以后我们就可以通过访问`service`测试一下.

正常情况下你可以看到`Hello This is new hostPath message.`这条信息

```yaml
[root@Online-Beijing-master1 yaml]# curl -v 10.10.56.102
* Rebuilt URL to: 10.10.56.102/
*   Trying 10.10.56.102...
* TCP_NODELAY set
* Connected to 10.10.56.102 (10.10.56.102) port 80 (#0)
> GET / HTTP/1.1
> Host: 10.10.56.102
> User-Agent: curl/7.61.1
> Accept: */*
> 
< HTTP/1.1 200 OK
< Server: nginx/1.23.3
< Date: Wed, 22 Mar 2023 09:54:49 GMT
< Content-Type: text/html
< Content-Length: 36
< Last-Modified: Wed, 22 Mar 2023 07:53:15 GMT
< Connection: keep-alive
< ETag: "641ab3eb-24"
< Accept-Ranges: bytes
Hello This is new hostPath message.
```

这个就是我们一个很简单的基于`hostPath`来持久化数据使用`PersistentVolume`和`PersistentVolumeClaim`简单教学。

## Local PersistentVolume

上面我们创建了后端是 `hostPath` 类型的 PV 资源对象,那么个人认为`hostPath`的缺点在于

1. Pod不能进行随时随地的节点更换,如果更换则会出现丢失数据的现象。

   需要每次都搭配`nodeSelector`进行使用。

其优点也是相对于比较明显

1. 因为`hostPath`使用的是本地磁盘,可以充分的利用磁盘的读写性能。

------

所以在 hostPath 的基础上，Kubernetes 依靠 PV、PVC 实现了一个新的特性，这个特性的名字叫作：`Local Persistent Volume`，也就是我们说的 `Local PV`。

`local` 卷只能用作静态创建的持久卷。不支持动态配置。

然而，`local` 卷仍然取决于底层节点的可用性，并不适合所有应用程序。 如果节点变得不健康，那么 `local` 卷也将变得不可被 Pod 访问。使用它的 Pod 将不能运行。 使用 `local` 卷的应用程序必须能够容忍这种可用性的降低，以及因底层磁盘的耐用性特征而带来的潜在的数据丢失风险。

### 它与HostPath有何不同？

为了更好地理解本地持久卷的优势，将其与[HostPath 卷](https://kubernetes.io/docs/concepts/storage/volumes/#hostpath)进行比较很有用。`HostPath` 卷将主机节点文件系统中的文件或目录挂载到 Pod 中。类似地，`Local Persistent Volume` 将本地磁盘或分区挂载到 Pod 中

最大的区别是 Kubernetes 调度程序了解本地持久卷属于哪个节点。对于 HostPath 卷，引用 HostPath 卷的 pod 可能会被调度程序移动到不同的节点，从而导致数据丢失。但是对于 `Local Persistent Volumes`，Kubernetes 调度器确保使用 `Local Persistent Volume` 的 pod 总是被调度到同一个节点。

虽然 HostPath 卷可以通过 `Persistent Volume Claim (PVC)` 引用或直接内嵌在 pod 定义中，但 `Local Persistent Volumes` 只能通过 PVC 引用。这提供了额外的安全优势，因为 `Persistent Volume` 对象由管理员管理，防止 Pod 能够访问主机上的任何路径。

> 所以，一般来说 `Local PV` 对应的存储介质是一块额外挂载在宿主机的磁盘或者块设备。

### 创建一个Local持久卷实例

下面是一个使用 `local` 卷和 `nodeAffinity` 的持久卷示例：

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: example-local
spec:
  capacity:
    storage: 20Gi
  volumeMode: Filesystem
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Delete
  storageClassName: local-storage
  local:
    path: /mnt/disks/ssd1
  nodeAffinity:
    required:
      nodeSelectorTerms:
      - matchExpressions:
        - key: kubernetes.io/hostname
          operator: In
          values:
          - online-beijing-node1
```

使用 `local` 卷时，你需要设置 `PersistentVolume` 对象的 `nodeAffinity` 字段。 Kubernetes 调度器使用 `PersistentVolume` 的 `nodeAffinity` 信息来将使用 `local` 卷的 Pod 调度到正确的节点。

当然了,这也就意味着如果你的Pod想使用这个`PV`的话,那么就只能运行在`online-beijing-node1`这个节点上。这样，调度器在调度 Pod 的时候，就能够知道一个 PV 与节点的对应关系，从而做出正确的选择。

**绑定PersistentVolumeClaim**

```yaml
kind: PersistentVolumeClaim
apiVersion: v1
metadata:
  name: bound-tasknginx
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: local-storage
```

接下来创建一个Pod来绑定这个Pvc,然后可以通过访问`Pod`的`IP`地址进行验证。

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pv-local-pod
spec:
  volumes:
  - name: example-pv-local
    persistentVolumeClaim:
      claimName: bound-tasknginx
  containers:
  - name: example-pv-local
    image: nginx
    ports:
    - containerPort: 80
    volumeMounts:
    - mountPath: /usr/share/nginx/html
      name: example-pv-local
[root@Online-Beijing-master1 yaml]# curl -v 10.10.38.225 
* Rebuilt URL to: 10.10.38.225/
*   Trying 10.10.38.225...
* TCP_NODELAY set
* Connected to 10.10.38.225 (10.10.38.225) port 80 (#0)
> GET / HTTP/1.1
> Host: 10.10.38.225
> User-Agent: curl/7.61.1
> Accept: */*
> 
< HTTP/1.1 200 OK
< Server: nginx/1.23.3
< Date: Thu, 23 Mar 2023 08:45:18 GMT
< Content-Type: text/html
< Content-Length: 25
< Last-Modified: Thu, 23 Mar 2023 08:43:41 GMT
< Connection: keep-alive
< ETag: "641c113d-19"
< Accept-Ranges: bytes
< 
Date: 2023-03-23 LocalPv
* Connection #0 to host 10.10.38.225 left intact
```

当然了你也可以进入到`Pod`当中查看是否成功

```bash
[root@Online-Beijing-master1 yaml]# kubectl exec -it pv-local-pod /bin/bash
root@pv-local-pod:/usr/share/nginx/html# cd /usr/share/nginx/html/
root@pv-local-pod:/usr/share/nginx/html# cat index.html 
Date: 2023-03-23 LocalPv
```

## 删除静态管理的持久化存储

需要注意的是，我们上面手动创建`PersistentVolume`的方式，即静态的`PersistentVolume`管理方式，在删除`PersistentVolume`时需要按如下流程执行操作。

1. 删除使用这个`PersistentVolume`的 Pod
2. 从宿主机移除本地磁盘
3. 删除`PersistentVolumeClaim`
4. 删除`PersistentVolume`