---
title: OpenEBS存储的使用
tags:
  - kubernetes
categories:
  - kubernetes
images: 
  - https://openebs.io/docs/assets/images/control-plane-overview-93c59878e3356a11f03029dd0fc1cd6b.svg
abbrlink: 4b0a295f
date: 2023-05-14 00:00:00
url: "kubernetes/openebs"
---
# OpenEBS存储使用

[OpenEBS](https://openebs.io/) 是一种模拟了 AWS 的 EBS、阿里云的云盘等块存储实现的基于容器的存储开源软件。OpenEBS 是一种基于 CAS(Container Attached Storage) 理念的容器解决方案，其核心理念是存储和应用一样采用微服务架构，并通过 Kubernetes 来做资源编排。其架构实现上，每个卷的 Controller 都是一个单独的 Pod，且与应用 Pod 在同一个节点，卷的数据使用多个 Pod 进行管理。

![openEBS组件](https://openebs.io/docs/assets/images/control-plane-overview-93c59878e3356a11f03029dd0fc1cd6b.svg)

OpenEBS 有很多组件，可以分为以下几类：

- 控制平面组件 - 管理 OpenEBS 卷容器，通常会用到容器编排软件的功能
- 数据平面组件 - 为应用程序提供数据存储，包含 Jiva 和 cStor 两个存储后端
- 节点磁盘管理器 - 发现、监控和管理连接到 Kubernetes 节点的媒体
- 与云原生工具的整合 - 与 Prometheus、Grafana、Fluentd 和 Jaeger 进行整合。

## 控制平面

OpenEBS 上下文中的控制平面是指部署在集群中的一组工具或组件，它们负责：

- 管理 kubernetes 工作节点上可用的存储
- 配置和管理数据引擎
- 与 CSI 接口以管理卷的生命周期
- 与 CSI 和其他工具进行接口，执行快照、克隆、调整大小、备份、恢复等操作。
- 集成到其他工具中，如 Prometheus/Grafana 以进行遥测和监控
- 集成到其他工具中进行调试、故障排除或日志管理

OpenEBS 控制平面由一组微服务组成，这些微服务本身由 Kubernetes 管理，使 OpenEBS 真正成为 Kubernetes 原生的。由 OpenEBS 控制平面管理的配置被保存为 Kubernetes 自定义资源。控制平面的功能可以分解为以下各个阶段：

![控制平面组件](https://openebs.io/docs/assets/images/openebs-control-plane-ed2fef338de5f1b10298fc5f5c0f4e3f.svg)

OpenEBS 提供了一个动态供应器，它是标准的 Kubernetes 外部存储插件。OpenEBS PV 供应器的主要任务是向应用 Pod 发起卷供应，并实现Kubernetes 的 PV 规范。

`m-apiserver` 暴露了存储 REST API，并承担了大部分的卷策略处理和管理。

控制平面和数据平面之间的连接采用 Kubernetes sidecar 模式。有如下几个场景，控制平面需要与数据平面进行通信。

- 对于 IOPS、吞吐量、延迟等卷统计 - 通过 `volume-exporter` sidecar实现
- 用于通过卷控制器 Pod 执行卷策略，以及通过卷复制 Pod 进行`磁盘/池`管理 - 通过卷管理 sidecar 实现。

## OpenEBS Local Pv

[OpenEBS 为Kubernetes Local Volumes](https://kubernetes.io/docs/concepts/storage/volumes/#local)提供动态 PV 供应器。本地卷意味着存储只能从单个节点使用。本地卷表示已挂载的本地存储设备，例如磁盘、分区或目录。

由于 Local Volume 只能从单个节点访问，因此本地卷受底层节点可用性的影响，并不适合所有应用程序。如果一个节点变得不健康，那么本地卷也将变得不可访问，使用它的 Pod 将无法运行。使用本地卷的应用程序必须能够容忍这种可用性降低以及潜在的数据丢失，具体取决于底层磁盘的耐用性特征。

可以从本地卷中受益的良好工作负载示例包括：

- 复制数据库，如 MongoDB、Cassandra
- 可以使用自己的高可用性配置（如 Elastic、MinIO）配置的有状态工作负载
- 通常在单个节点或单节点 Kubernetes 集群中运行的边缘工作负载。

OpenEBS 通过提供 Kubernetes 当前缺少的功能来帮助用户将本地卷投入生产，例如：

- 本地卷的动态 PV Provisioner。
- 由 Ext3、XFS、LVM 或 ZFS 等文件系统上的主机路径支持的本地卷。
- 监控用于创建本地卷的底层设备或存储的健康状况。
- 容量管理功能，如过度配置和/或配额强制执行。
- 当本地卷由 ZFS 等高级文件系统支持时，可以使用快照、克隆、压缩等底层存储功能。
- 通过 Velero 进行备份和恢复。
- 通过 LUKS 或使用底层文件系统（如 ZFS）的内置加密支持来保护本地卷。

## 节点磁盘管理器(NDM)

节点磁盘管理器（NDM）是OpenEBS架构中的一个重要组件。NDM 将块设备视为需要监控和管理的资源，就像其他资源（如 CPU、内存和网络）一样。它是一个运行在每个节点上的守护进程，根据过滤器检测附加的块设备并将它们作为块设备自定义资源加载到 Kubernetes 中。这些自定义资源旨在通过提供以下功能来帮助超融合存储运营商：

- 易于访问 Kubernetes 集群中可用的块设备清单。
- 预测磁盘故障以帮助采取预防措施。
- 允许动态地将磁盘附加/分离到存储 pod，而无需重新启动在磁盘附加/分离的节点上运行的相应 NDM pod。
- `Node Disk Manager`在`Kubernetes`中是以`DaemonSet`的方式进行运行的
- [Node Disk Manager](https://openebs.io/docs/concepts/ndm)

尽管执行了上述所有操作，但 NDM 有助于整体简化持久卷的配置。

![NDM](https://openebs.io/docs/assets/files/ndm-96fc51e849ddea8084d8b800d0e08975.svg)

> NDM 在安装 OpenEBS 期间部署为守护进程。NDM daemonset 发现每个节点上的磁盘并创建称为块设备或 BD 的自定义资源。

## 启用OpenEBS

由于 OpenEBS 通过 iSCSI 协议提供存储支持，因此，需要在所有 Kubernetes 节点上都安装 iSCSI 客户端（启动器）。

比如我们这里使用的是Rocky的系统，执行下面的命令安装启动 iSCSI 启动器：

```bash
dnf install iscsi-initiator-utils -y
# 查看iSCSI状态是否正常
cat /etc/iscsi/initiatorname.iscsi
# 启动iSCSI
systemctl start iscsid.service
systemctl status iscsid.service
```

### 安装OpenEBS

1. 使用`kubectl`的方式进行安装

- Helm部署也是可选的: [地址](https://openebs.io/docs/user-guides/installation#installation-through-helm)

```bash
[root@Online-Beijing-master1 ~]# kubectl apply -f https://openebs.github.io/charts/openebs-operator.yaml
# 检查是否安装完成,正常应该都是Running即可
[root@Online-Beijing-master1 ~]# kubectl get pods -n openebs
NAME                                           READY   STATUS    RESTARTS   AGE
openebs-localpv-provisioner-846c6bdc56-vvvsv   1/1     Running   0          6m11s
openebs-ndm-5sfdk                              1/1     Running   0          6m11s
openebs-ndm-cluster-exporter-b49987ffb-vjq87   1/1     Running   0          6m11s
openebs-ndm-kthfj                              1/1     Running   0          6m11s
openebs-ndm-node-exporter-94zhh                1/1     Running   0          6m11s
openebs-ndm-node-exporter-q9h5p                1/1     Running   0          6m11s
openebs-ndm-node-exporter-x7z9t                1/1     Running   0          6m11s
openebs-ndm-operator-6469f6bb4c-95kss          1/1     Running   0          6m11s
openebs-ndm-wf9k2                              1/1     Running   0          6m11s

# 正常我们会有两个StorageClass
[root@Online-Beijing-master1 ~]# kubectl get sc
NAME               PROVISIONER        RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
openebs-device     openebs.io/local   Delete          WaitForFirstConsumer   false                  20m
openebs-hostpath   openebs.io/local   Delete          WaitForFirstConsumer   false                  20m
```

1. 我们自己创建一个`Pvc`对象来给我们的`Deployment`来进行使用

```yanml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: local-hostpath-pvc
spec:
  storageClassName: openebs-hostpath
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

1. 创建一个Pod进行测试

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hello-local-hostpath-pod
spec:
  volumes:
  - name: local-storage
    persistentVolumeClaim:
      claimName: local-hostpath-pvc
  containers:
  - name: hello-container
    image: busybox
    command:
       - sh
       - -c
       - 'while true; do echo "`date` [`hostname`] Hello from OpenEBS Local PV." >> /mnt/store/greet.txt; sleep $(($RANDOM % 5 + 300)); done'
    volumeMounts:
    - mountPath: /data
      name: local-storage
```

> 注意：如果你想知道这个Pvc具体挂载位置可以使用`kubectl describe pv pv名称`,其中的`Ptah: /var/openebs/local/pvc-e011f2a1-27dc-46d0-ba34-9ad44ba03188`就是我们所在节点的路径

```bash
[root@Online-Beijing-master1 ~]# kubectl get pv
NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                        STORAGECLASS       REASON   AGE
example-local                              20Gi       RWO            Delete           Bound    default/bound-tasknginx      local-storage               26d
pvc-e011f2a1-27dc-46d0-ba34-9ad44ba03188   1Gi        RWO            Delete           Bound    default/local-hostpath-pvc   openebs-hostpath            3m53s
[root@Online-Beijing-master1 ~]# kubectl describe pv pvc-e011f2a1-27dc-46d0-ba34-9ad44ba03188
Name:              pvc-e011f2a1-27dc-46d0-ba34-9ad44ba03188
Labels:            openebs.io/cas-type=local-hostpath
Annotations:       pv.kubernetes.io/provisioned-by: openebs.io/local
Finalizers:        [kubernetes.io/pv-protection]
StorageClass:      openebs-hostpath
Status:            Bound
Claim:             default/local-hostpath-pvc
Reclaim Policy:    Delete
Access Modes:      RWO
VolumeMode:        Filesystem
Capacity:          1Gi
Node Affinity:     
  Required Terms:  
    Term 0:        kubernetes.io/hostname in [online-beijing-node1]
Message:           
Source:
    Type:  LocalVolume (a persistent volume backed by local storage on a node)
    Path:  /var/openebs/local/pvc-e011f2a1-27dc-46d0-ba34-9ad44ba03188
Events:    <none>
```

1. 进入所在节点的目录进行验证

```bash
cd  /var/openebs/local/pvc-e011f2a1-27dc-46d0-ba34-9ad44ba03188
# 随便创建一个文件
touch openebs.txt
# 进入容器内部
kubectl exec -it nginx-67fbcff654-glklg bash
# 查看所挂载openebs的路径是否成功有openebs.txt
root@nginx-67fbcff654-glklg:/# ls /data/
1.txt  openebs.txt
```

## 修改OpenEBS的HostPath默认存储

1. 修改名字为`openebs-hostpath`的`StorageClass`当中的`BasePath`即可

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: openebs-hostpath
  annotations:
    openebs.io/cas-type: local
    cas.openebs.io/config: |
      #hostpath type will create a PV by 
      # creating a sub-directory under the
      # BASEPATH provided below.
      - name: StorageType
        value: "hostpath"
      #Specify the location (directory) where
      # where PV(volume) data will be saved. 
      # A sub-directory with pv-name will be 
      # created. When the volume is deleted, 
      # the PV sub-directory will be deleted.
      #Default value is /var/openebs/local
      - name: BasePath
        value: "/var/openebs/local/"
```


