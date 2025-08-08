---
title: 录制课程-集群部署-1-利用Kubeadm进行多Master高可用部署
tags:
  - kubernetes
  - 录制课程一阶段
categories:
  - kubernetes
description: 如何使用kubeadm方案来安装高可用的kubernetes集群
heroImage: { src: "https://img14.360buyimg.com/ddimg/jfs/t1/164569/9/40677/14419/65bc6e4cFa1d8c0c3/5ccf7e6caadc9b83.jpg",inferSize: true }
slug: "/tech/kubernetes/install-kubernetes-ha"
publishDate: 2025-01-01 00:00:00
---
# 利用Kubeadm创建高可用集群

- 使用具有堆叠的控制平面节点。这种方法所需基础设施较少。etcd 成员和控制平面节点位于同一位置。
- 使用外部 etcd 集群。这种方法所需基础设施较多。控制平面的节点和 etcd 成员是分开的。
  在下一步之前，你应该仔细考虑哪种方法更好地满足你的应用程序和环境的需求。 高可用拓扑选项 讲述了每种方法的优缺点。
- [如何安装Kubectl和Kubeadm](http://blog.mletter.cn/blog//tech/kubernetes/install-kubernetes-1220  )
- [如何安装外部的Etcd集群](http://blog.mletter.cn/blog//tech/kubernetes/install-etcd-ha)
  
## 参与主机列表
  
  | IP         | CPU | 内存  | 硬盘  | 角色               |
  | ---------- | --- | --- |:--- |:---------------- |
  | 10.1.6.48  | 8   | 16  | 100 | control-plane1   |
  | 10.1.6.24  | 8   | 16  | 100 | control-plane2   |
  | 10.1.6.45  | 8   | 16  | 100 | control-plane3   |
  | 10.1.6.46  | 8   | 16  | 100 | work1            |
  | 10.1.6.43  | 8   | 16  | 100 | work2            |
  | 10.1.6.47  | 8   | 16  | 100 | work3            |
  | 10.1.6.213 | 4   | 4   | 20  | HA+KP1           |
  | 10.1.6.214 | 4   | 4   | 20  | HA+KP2           |
  | 10.1.6.215 |     |     |     | Load_Balancer_IP |
  | 10.1.6.51  | 8   | 16  | 100 | Etcd1            |
  | 10.1.6.52  | 8   | 16  | 100 | Etcd2            |
  | 10.1.6.53  | 8   | 16  | 100 | Etcd3            |

## 为Kube-apiserver创建负载均衡器

Keepalived 提供 VRRP 实现，并允许您配置 Linux 机器使负载均衡，预防单点故障。HAProxy 提供可靠、高性能的负载均衡，能与 Keepalived 完美配合。

由于 lb1 和 lb2 上安装了 Keepalived 和 HAproxy，如果其中一个节点故障，虚拟 IP 地址（即浮动 IP 地址）将自动与另一个节点关联，使集群仍然可以正常运行，从而实现高可用。若有需要，也可以此为目的，添加更多安装 Keepalived 和 HAproxy 的节点。

先运行以下命令安装 `Keepalived` 和 `HAproxy`。

```bash
yum install keepalived haproxy psmisc -y
dnf install keepalived haproxy psmisc -y
```

在两台用于负载均衡的机器上运行以下命令以配置 Proxy（两台机器的 Proxy 配置相同）：

```bash
vi /etc/haproxy/haproxy.cfg
```

```conf
global
    log /dev/log  local0 warning
    chroot      /var/lib/haproxy
    pidfile     /var/run/haproxy.pid
    maxconn     4000
    user        haproxy
    group       haproxy
    daemon

   stats socket /var/lib/haproxy/stats

defaults
  log global
  option  httplog
  option  dontlognull
        timeout connect 5000
        timeout client 50000
        timeout server 50000

frontend kube-apiserver
  bind *:8443
  mode tcp
  option tcplog
  default_backend kube-apiserver

backend kube-apiserver
    mode tcp
    option tcplog
    option tcp-check
    balance roundrobin
    default-server inter 10s downinter 5s rise 2 fall 2 slowstart 60s maxconn 250 maxqueue 256 weight 100
    server kube-apiserver-1 10.1.6.48:6443 check # Replace the IP address with your own.
    server kube-apiserver-2 10.1.6.24:6443 check # Replace the IP address with your own.
    server kube-apiserver-3 10.1.6.45:6443 check # Replace the IP address with your own.
```

启动Haproxy

> 请确保你的LB2也已经进行如上配置

```bash
systemctl restart haproxy
systemctl enable haproxy
```

配置Keepalived
`KP1`配置如下

```bash
vim /etc/keepalived/keepalived.conf
```

```conf
global_defs {
  notification_email {
  }
  router_id LVS_DEVEL
  vrrp_skip_check_adv_addr
  vrrp_garp_interval 0
  vrrp_gna_interval 0
}

vrrp_script chk_haproxy {
  script "killall -0 haproxy"
  interval 2
  weight 2
}

vrrp_instance haproxy-vip {
  state BACKUP
  priority 100
  interface ens192                      # 网卡名称
  virtual_router_id 60
  advert_int 1
  authentication {
    auth_type PASS
    auth_pass 1111
  }
  unicast_src_ip 10.1.6.213      # The IP address of this machine
  unicast_peer {
    10.1.6.214                  # The IP address of peer machines
  }

  virtual_ipaddress {
    10.1.6.215/24                  # 虚拟IP地址
  }

  track_script {
    chk_haproxy
  }
}
```

`KP2`配置如下

```bash
vim /etc/keepalived/keepalived.conf
```

```conf
global_defs {
  notification_email {
  }
  router_id LVS_DEVEL
  vrrp_skip_check_adv_addr
  vrrp_garp_interval 0
  vrrp_gna_interval 0
}

vrrp_script chk_haproxy {
  script "killall -0 haproxy"
  interval 2
  weight 2
}

vrrp_instance haproxy-vip {
  state BACKUP
  priority 90
  interface ens192                      # Network card
  virtual_router_id 60
  advert_int 1
  authentication {
    auth_type PASS
    auth_pass 1111
  }
  unicast_src_ip 10.1.6.214      # The IP address of this machine
  unicast_peer {
    10.1.6.214                         # The IP address of peer machines
  }

  virtual_ipaddress {
    10.1.6.215/24                  # The VIP address
  }

  track_script {
    chk_haproxy
  }
}
```

请确保你的`KP1`和`KP2`都完成了如上配置

```bash
systemctl start keepalived
systemctl enable keepalived
```

## 配置Master主机节点的Hosts文件

- 所有的Master主机都需要进行配置,防止后续解析不到`api.k8s.verbos.com`
  
  ```conf
  10.1.6.48 containerd-master1
  10.1.6.24 containerd-master2
  10.1.6.45 containerd-master3
  10.1.6.46 containerd-work1
  10.1.6.43 containerd-work2
  10.1.6.47 containerd-work3
  10.1.6.51 etcd1
  10.1.6.52 etcd2
  10.1.6.53 etcd3
  10.1.6.215  api.k8s.verbos.com
  ```
  ### 设置Etcd集群证书
  
  如果你使用的是工作在Work节点的Etcd或者其他单独的Etcd集群,请将Etcd的`ca`证书进行拷贝到Master节点当中.
  ```bash
  export CONTROL_PLANE="root@10.1.6.48"
  scp /etc/kubernetes/pki/etcd/ca.crt "${CONTROL_PLANE}":
  scp /etc/kubernetes/pki/apiserver-etcd-client.crt "${CONTROL_PLANE}":
  scp /etc/kubernetes/pki/apiserver-etcd-client.key "${CONTROL_PLANE}":
  ```
  
  ## 设置第一个控制平面节点
  
  用以下内容创建一个名为 `kubeadm-config.yaml` 的文件
  ```yaml
  apiVersion: kubeadm.k8s.io/v1beta3
  kind: ClusterConfiguration
  kubernetesVersion: v1.22.10
  controlPlaneEndpoint: "api.k8s.verbos.com:8443"
  apiServer:
    certSANs:
  
  - 10.1.6.48
  - 10.1.6.24
  - 10.1.6.45
    etcd:
    external:
    endpoints:
    - https://10.1.6.51:2379 # 适当地更改 ETCD_0_IP
    - https://10.1.6.52:2379 # 适当地更改 ETCD_1_IP
    - https://10.1.6.53:2379 # 适当地更改 ETCD_2_IP
      caFile: /etc/kubernetes/pki/etcd/ca.crt
      certFile: /etc/kubernetes/pki/apiserver-etcd-client.crt
      keyFile: /etc/kubernetes/pki/apiserver-etcd-client.key
      imageRepository: registry.aliyuncs.com/google_containers
      networking:
      podSubnet: 10.244.0.0/16
      serviceSubnet: 10.10.0.0/16
  ```

在节点上运行如下命令
```bash
kubeadm init --config kubeadm-config.yaml --upload-certs --v=5
```

> 注意：如果你的集群初始化成功你将会看到如下信息.

- 请保存好`kubeadm join`的内容,默认2小时后过期,过期后重新生成即可

```bash
Your Kubernetes control-plane has initialized successfully!
To start using your cluster, you need to run the following as a regular user:

  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config

Alternatively, if you are the root user, you can run:

  export KUBECONFIG=/etc/kubernetes/admin.conf

You should now deploy a pod network to the cluster.
Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:
  https://kubernetes.io/docs/concepts/cluster-administration/addons/

You can now join any number of the control-plane node running the following command on each as root:

  kubeadm join api.k8s.verbos.com:8443 --token 9oerz0.fw6s8ft9xa44i077 \
        --discovery-token-ca-cert-hash sha256:be3c70562ae6bf8cfcfbbfa3bb8124fe63af3b1a0671e806a4ccf1bc243d5c6b \
        --control-plane --certificate-key cdf0f280f9e59e18e5f60d98b624008d828ba00ef096a2e38fd9b6b1463be152

Please note that the certificate-key gives access to cluster sensitive data, keep it secret!
As a safeguard, uploaded-certs will be deleted in two hours; If necessary, you can use
"kubeadm init phase upload-certs --upload-certs" to reload certs afterward.

Then you can join any number of worker nodes by running the following on each as root:

kubeadm join api.k8s.verbos.com:8443 --token 9oerz0.fw6s8ft9xa44i077 \
        --discovery-token-ca-cert-hash sha256:be3c70562ae6bf8cfcfbbfa3bb8124fe63af3b1a0671e806a4ccf1bc243d5c6b 
```

**拷贝集群配置文件**

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

## 运行网络CNI插件(Calico)

> 注意：此时你应当有一个CNI插件来提供网络服务,如果不安装CNI插件,那么集群将会处于`不可用`状态.

如果你可以正常访问github

```bash
[root@containerd-kube-master .kube]# curl https://raw.githubusercontent.com/projectcalico/calico/v3.24.1/manifests/calico.yaml -O
```

国内用户

```bash
curl https://projectcalico.docs.tigera.io/manifests/calico.yaml -O
```

### 修改Calico.yaml配置

修改CIDR为Kubernetes的子网地址,该地址为`serviceSubnet`的地址,也就是Pod运行的地址。

```yaml
- name: CALICO_IPV4POOL_CIDR
  value: "10.10.0.0/16"
```

执行`calico.yaml`

```bash
kubectl apply -f calico.yaml
```

## 将其他控制平面节点加入集群

当你已经确保你的`containerd-master1`完成初始化的时候,你可以将其他的master节点加入到此集群当中.

```bash
  kubeadm join api.k8s.verbos.com:8443 --token 9oerz0.fw6s8ft9xa44i077 \
        --discovery-token-ca-cert-hash sha256:be3c70562ae6bf8cfcfbbfa3bb8124fe63af3b1a0671e806a4ccf1bc243d5c6b \
        --control-plane --certificate-key cdf0f280f9e59e18e5f60d98b624008d828ba00ef096a2e38fd9b6b1463be152
```

加入集群成功后,请拷贝集群配置文件否则将影响`kubelet`的工作

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

## 将工作节点加入集群

```bash
kubeadm join api.k8s.verbos.com:8443 --token mck9bg.renw4t689mmx7oe1 \
        --discovery-token-ca-cert-hash sha256:ed51fca8615acf5f437f63f66a9709e43ef942caf19aea4c595cb905e4a9a00f
```

## (可选项)修改Kubelet的数据存储目录

如果你需要修改kubelet的数据存储目录,请按照如下方式进行操作

```bash
vim /etc/sysconfig/kubelet
```

设置你的kubelet的数据存储目录(建议单独的为kubelet挂载一块数据盘)

```conf
KUBELET_EXTRA_ARGS="--root-dir=/data/k8s/kubelet"
```

重启kubelet

```bash
systemctl daemon-reloa
systemctl restart kubelet
umount $(df -HT | grep '/var/lib/kubelet/pods' | awk '{print $7}')
```

查看新的数据目录是否有kubelet的数据

```bash
[root@containerd-master2 kubelet]# ls /data/k8s/kubelet/
cpu_manager_state  memory_manager_state  plugins  plugins_registry  pod-resources  pods
```

## 如何剔除一个Master
- 先说一个问题,当我们正常如果一个Master要进行某种升级的时候,如何正确的安全的来进行删除该Master。
1. 首先我们要将该Master设置为不可调度的状态,并且驱逐在其上面的Pod
```bash
# 设置Master为不可调度的状态
kubectl cordon online-beijing-master1
# 将Master剔除该集群
kubectl drain online-beijing-master1 --ignore-daemonsets
# 然后将其节点从集群中删除
kubectl delete node online-beijing-master1
```

> 这里提一个小问题: 当你使用`kubectl drain`的时候,如果你当前的Master已经有挂载的`emptyDir`需要使用`--delete-emptydir-data `进行删除。
> TODO: 删除前请注意备份您的数据。