---
title: 使用Kubeadm创建一个高可用的ETCD集群
tags:
  - kubernetes
  - etcd
categories:
  - kubernetes
description: >-
  默认情况下，kubeadm 在每个控制平面节点上运行一个本地 etcd 实例。也可以使用外部的 etcd 集群，并在不同的主机上提供 etcd 实例。
  这两种方法的区别在 高可用拓扑的选项 页面中阐述。这个任务将指导你创建一个由三个成员组成的高可用外部 etcd 集群，该集群在创建过程中可被 kubeadm
  使用。
images: 
  - https://img.linux.net.cn/data/attachment/album/201501/29/141718izklanww82qm888k.png
date: 2023-02-26 00:00:00
url: "kubernetes/InstallEtcdHA"
---

## 使用Kubeadm创建一个高可用的Etcd集群

默认情况下，kubeadm 在每个控制平面节点上运行一个本地 etcd 实例。也可以使用外部的 etcd 集群，并在不同的主机上提供 etcd 实例。 这两种方法的区别在 高可用拓扑的选项 页面中阐述。

这个任务将指导你创建一个由三个成员组成的高可用外部 etcd 集群，该集群在创建过程中可被 kubeadm 使用。

## 准备开始

- 三个可以通过 2379 和 2380 端口相互通信的主机。本文档使用这些作为默认端口。不过，它们可以通过 kubeadm 的配置文件进行自定义。
- 每个主机必须安装 systemd 和 bash 兼容的 shell。
- 每台主机必须安装`有容器运行时`、`kubelet` 和 `kubeadm`
- 每个主机都应该能够访问 Kubernetes 容器镜像仓库 ([registry.k8s.io](http://registry.k8s.io/))， 或者使用 kubeadm config images list/pull 列出/拉取所需的 etcd 镜像。 本指南将把 etcd 实例设置为由 kubelet 管理的静态 Pod。
- 一些可以用来在主机间复制文件的基础设施。例如 ssh 和 scp 就可以满足需求。

> 本次容器运行时采用`Containerd`作为Runtime

### 将Kubelet配置为Etcd的服务启动管理器

> 你必须在要运行 etcd 的所有主机上执行此操作。

```bash
cat << EOF > /usr/lib/systemd/system/kubelet.service.d/20-etcd-service-manager.conf 
[Service]
ExecStart=
ExecStart=/usr/bin/kubelet --address=127.0.0.1 --pod-manifest-path=/etc/kubernetes/manifests --cgroup-driver=systemd  --container-runtime=remote --container-runtime-endpoint=unix:///run/containerd/containerd.sock
Restart=always
EOF
```

启动kubelet

```bash
systemctl daemon-reload
systemctl restart kubelet
```

> 注意: 请执行完毕后务必确保`kubelet`处于`running`状态。

### 为Kubeadm创建配置文件
```bash
# 使用你的主机 IP 替换 HOST0、HOST1 和 HOST2 的 IP 地址
export HOST0=10.1.6.48
export HOST1=10.1.6.24
export HOST2=10.1.6.45
# 使用你的主机名更新 NAME0、NAME1 和 NAME2
export NAME0="containerd-master1"
export NAME1="containerd-master2"
export NAME2="containerd-master3"
# 创建临时目录来存储将被分发到其它主机上的文件
mkdir -p /tmp/${HOST0}/ /tmp/${HOST1}/ /tmp/${HOST2}/

HOSTS=(${HOST0} ${HOST1} ${HOST2})
NAMES=(${NAME0} ${NAME1} ${NAME2})

for i in "${!HOSTS[@]}"; do
HOST=${HOSTS[$i]}
NAME=${NAMES[$i]}
cat << EOF > /tmp/${HOST}/kubeadmcfg.yaml
---
apiVersion: "kubeadm.k8s.io/v1beta3"
kind: InitConfiguration
nodeRegistration:
    name: ${NAME}
localAPIEndpoint:
    advertiseAddress: ${HOST}
---
apiVersion: "kubeadm.k8s.io/v1beta3"
kind: ClusterConfiguration
etcd:
    local:
        dataDir: /var/lib/etcds
        serverCertSANs:
        - "${HOST}"
        peerCertSANs:
        - "${HOST}"
        extraArgs:
            initial-cluster: ${NAMES[0]}=https://${HOSTS[0]}:2380,${NAMES[1]}=https://${HOSTS[1]}:2380,${NAMES[2]}=https://${HOSTS[2]}:2380
            initial-cluster-state: new
            name: ${NAME}
            listen-peer-urls: https://${HOST}:2380
            listen-client-urls: https://${HOST}:2379
            advertise-client-urls: https://${HOST}:2379
            initial-advertise-peer-urls: https://${HOST}:2380
imageRepository: registry.aliyuncs.com/google_containers
EOF
done
```

### 生成证书颁发机构

如果你还没有 CA，则在 $HOST0（你为 kubeadm 生成配置文件的位置）上运行此命令。

```bash
kubeadm init phase certs etcd-ca
```

- 这一操作将会生成
  - `/etc/kubernetes/pki/etcd/ca.crt`
  - `/etc/kubernetes/pki/etcd/ca.key`

### 为每个成员创建证书

```bash
kubeadm init phase certs etcd-server --config=/tmp/${HOST2}/kubeadmcfg.yaml
kubeadm init phase certs etcd-peer --config=/tmp/${HOST2}/kubeadmcfg.yaml
kubeadm init phase certs etcd-healthcheck-client --config=/tmp/${HOST2}/kubeadmcfg.yaml
kubeadm init phase certs apiserver-etcd-client --config=/tmp/${HOST2}/kubeadmcfg.yaml
cp -R /etc/kubernetes/pki /tmp/${HOST2}/
# 清理不可重复使用的证书
find /etc/kubernetes/pki -not -name ca.crt -not -name ca.key -type f -delete

kubeadm init phase certs etcd-server --config=/tmp/${HOST1}/kubeadmcfg.yaml
kubeadm init phase certs etcd-peer --config=/tmp/${HOST1}/kubeadmcfg.yaml
kubeadm init phase certs etcd-healthcheck-client --config=/tmp/${HOST1}/kubeadmcfg.yaml
kubeadm init phase certs apiserver-etcd-client --config=/tmp/${HOST1}/kubeadmcfg.yaml
cp -R /etc/kubernetes/pki /tmp/${HOST1}/
find /etc/kubernetes/pki -not -name ca.crt -not -name ca.key -type f -delete

# HOST0不需要进行移动
kubeadm init phase certs etcd-server --config=/tmp/${HOST0}/kubeadmcfg.yaml
kubeadm init phase certs etcd-peer --config=/tmp/${HOST0}/kubeadmcfg.yaml
kubeadm init phase certs etcd-healthcheck-client --config=/tmp/${HOST0}/kubeadmcfg.yaml
kubeadm init phase certs apiserver-etcd-client --config=/tmp/${HOST0}/kubeadmcfg.yaml
```

### 复制证书和 kubeadm 配置

```bash
scp -r /tmp/${HOST1}/* root@${HOST1}:
scp -r /tmp/${HOST2}/* root@${HOST2}:
chown -R root:root pki/
mv pki /etc/kubernetes/
```

### 请检查证书文件是否都存在

检查`$HOST0`

```bash
[root@containerd-master1 ~]# tree /etc/kubernetes/pki/
/etc/kubernetes/pki/
├── apiserver-etcd-client.crt
├── apiserver-etcd-client.key
└── etcd
    ├── ca.crt
    ├── ca.key
    ├── healthcheck-client.crt
    ├── healthcheck-client.key
    ├── peer.crt
    ├── peer.key
    ├── server.crt
    └── server.key

1 directory, 10 files
```

检查`$HOST1`

```bash
[root@containerd-master2 ~]# tree /etc/kubernetes/pki/
/etc/kubernetes/pki/
├── apiserver-etcd-client.crt
├── apiserver-etcd-client.key
└── etcd
    ├── ca.crt
    ├── healthcheck-client.crt
    ├── healthcheck-client.key
    ├── peer.crt
    ├── peer.key
    ├── server.crt
    └── server.key

1 directory, 9 files
```

检查`$HOST2`

```bash
[root@containerd-master3 ~]# tree /etc/kubernetes/pki/
/etc/kubernetes/pki/
├── apiserver-etcd-client.crt
├── apiserver-etcd-client.key
└── etcd
    ├── ca.crt
    ├── healthcheck-client.crt
    ├── healthcheck-client.key
    ├── peer.crt
    ├── peer.key
    ├── server.crt
    └── server.key

1 directory, 9 files
```

### 创建Etcd的Pod清单

请在`$HOST0`进行执行

```bash
kubeadm init phase etcd local --config=/tmp/${HOST0}/kubeadmcfg.yaml
```

请在`$HOST1`进行执行

```bash
kubeadm init phase etcd local --config=$HOME/kubeadmcfg.yaml
```

请在`$HOST2`进行执行

```bash
kubeadm init phase etcd local --config=$HOME/kubeadmcfg.yaml
```

### 检查Etcd的Pod是否运行

- 三台Etcd主机全部使用`crictl ps -a `进行查看EtcdPod是否处于`running`状态

```bash
[root@containerd-master1 ~]# crictl ps -a
CONTAINER           IMAGE               CREATED             STATE               NAME                ATTEMPT             POD ID              POD
0a183925d2542       0048118155842       52 seconds ago      Running     
```