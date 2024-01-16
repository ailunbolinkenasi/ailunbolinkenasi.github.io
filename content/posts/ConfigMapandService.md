---
title: ConfigMap和Secret的使用
tags:
  - kubernetes
  - configmap
  - secret
categories:
  - kubernetes
description: ConfigMap 是一种 API 对象，用来将非机密性的数据保存到键值对中。使用时， Pods 可以将其用作环境变量、命令行参数或者存储卷中的配置文件。
images: 
  - https://fc.sinaimg.cn/large/005Czbxjgy1hlm862knaqj30sg0e875n.jpg
date: 2023-02-14 00:00:00
url: "kubernetes/configmaporservice"
---

## ConfigMap

ConfigMap 是一种 API 对象，用来将非机密性的数据保存到键值对中。使用时， [Pods](https://kubernetes.io/zh-cn/docs/concepts/workloads/pods/) 可以将其用作环境变量、命令行参数或者存储卷中的配置文件。

ConfigMap 将你的环境配置信息和 [容器镜像](https://kubernetes.io/zh-cn/docs/reference/glossary/?all=true#term-image) 解耦，便于应用配置的修改。
ConfigMap 在设计上不是用来保存大量数据的。在 ConfigMap 中保存的数据不可超过1MiB(这其实是ETCD的要求哈哈哈)。如果你需要保存超出此尺寸限制的数据，你可能希望考虑挂载存储卷 或者使用独立的数据库或者文件服务。

这是一个 ConfigMap 的示例，它的一些键只有一个值，其他键的值看起来像是 配置的片段格式。

- 通过`Key`和`Value`这种键值对来进行写入数据

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: game-demo
data:
  # 类属性键；每一个键都映射到一个简单的值
  player_initial_lives: "3"
  ui_properties_file_name: "user-interface.properties"
  # 类文件键,一般用来保存一个文件到指定目录
  game.properties: |
    enemy.types=aliens,monsters
    player.maximum-lives=5    
  user-interface.properties: |
    color.good=purple
    color.bad=yellow
    allow.textmode=true
```

你可以使用四种方式来使用 ConfigMap 配置 Pod 中的容器：

1. 在容器命令和参数内
2. 容器的环境变量
3. 在只读卷里面添加一个文件，让应用来读取
4. 编写代码在 Pod 中运行，使用 Kubernetes API 来读取 ConfigMap

### 通过环境变量的方式使用ConfigMap

首先我们创建一个`Deployment`然后通过Env环境变量的方式进行使用`ConfigMap`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-web-beijing
  namespace: default
  labels:
    k8s-app: nginx-web
    zone: beijing
spec:
  replicas: 1
  selector:
    matchLabels:
      k8s-app: nginx-web
  template:
    metadata:
      name: nginx-web-beijing
      labels:
        k8s-app: nginx-web
    spec:
      containers:
        - name: vue-shop-beijing
          image: nginx:latest
          resources:
            requests:
              memory: 100Mi
              cpu: 10m
          # 通过环境变量的方式进行挂载
          env:
            - name: PLAYER_INITIAL_LIVES
              valueFrom: 
                configMapKeyRef:  
                  name: game-demo  # 表示当前键来自game-demo这个ConfigMap
                  key: player_initial_lives # 表示取player_initial_lives这个键的内容
```

然后我们可以进入到Pod内部进行`echo`挂载的变量名查看是否有输出

```bash
root@nginx-web-beijing-d6d994854-d6tjk:/# echo $PLAYER_INITIAL_LIVES
3
```

### 将ConfigMap当做文件使用

1. 创建一个 ConfigMap 对象或者使用现有的 ConfigMap 对象。多个 Pod 可以引用同一个 ConfigMap。
2. 修改 Pod 定义，在 `spec.volumes[]` 下添加一个卷。 为该卷设置任意名称，之后将 `spec.volumes[].configMap.name` 字段设置为对你的 ConfigMap 对象的引用。
3. 为每个需要该 ConfigMap 的容器添加一个 `.spec.containers[].volumeMounts[]`。 设置 `.spec.containers[].volumeMounts[].readOnly=true` 并将 `.spec.containers[].volumeMounts[].mountPath` 设置为一个未使用的目录名， ConfigMap 的内容将出现在该目录中。
4. 更改你的镜像或者命令行，以便程序能够从该目录中查找文件。ConfigMap 中的每个 `data` 键会变成 `mountPath` 下面的一个文件名。

创建一个挂载ConfigMap的`Deployment`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-web-beijing
  namespace: default
  labels:
    k8s-app: nginx-web
    zone: beijing
spec:
  replicas: 1
  selector:
    matchLabels:
      k8s-app: nginx-web
  template:
    metadata:
      name: nginx-web-beijing
      labels:
        k8s-app: nginx-web
    spec:
      containers:
        - name: vue-shop-beijing
          image: nginx:latest
          resources:
            requests:
              memory: 100Mi
              cpu: 10m
          volumeMounts:
          - name: vue-config
            mountPath: "/etc/vue-config"
            readOnly: true
      volumes:
      - name: vue-config
        configMap:
          name: game-demo
```

进入容器中查看`/etc/vue-config`目录下是否有配置文件

```bash
root@nginx-web-beijing-5649b8f646-pzmm4:/etc/vue-config# ls
service-interface.properties
root@nginx-web-beijing-5649b8f646-pzmm4:/etc/vue-config# cat service-interface.properties  
port: 4000
```

如果 Pod 中有多个容器，则每个容器都需要自己的 `volumeMounts` 块，但针对每个 ConfigMap，你只需要设置一个 `spec.volumes` 块。

### 被挂载的ConfigMap内容会被自动更新

当卷中使用的 ConfigMap 被更新时，所投射的键最终也会被更新。 kubelet 组件会在每次周期性同步时检查所挂载的 ConfigMap 是否为最新。 不过，kubelet 使用的是其本地的高速缓存来获得 ConfigMap 的当前值。 高速缓存的类型可以通过 [KubeletConfiguration 结构](https://kubernetes.io/zh-cn/docs/reference/config-api/kubelet-config.v1beta1/). 的 `ConfigMapAndSecretChangeDetectionStrategy` 字段来配置。

ConfigMap 既可以通过 watch 操作实现内容传播（默认形式），也可实现基于 TTL 的缓存，还可以直接经过所有请求重定向到 API 服务器。 因此，从 ConfigMap 被更新的那一刻算起，到新的主键被投射到 Pod 中去， 这一时间跨度可能与 kubelet 的同步周期加上高速缓存的传播延迟相等。 这里的传播延迟取决于所选的高速缓存类型 （分别对应 watch 操作的传播延迟、高速缓存的 TTL 时长或者 0）。

> 以环境变量方式使用的 ConfigMap 数据不会被自动更新。 更新这些数据需要重新启动 Pod。

## Secret

Secret 是一种包含少量敏感信息例如密码、令牌或密钥的对象。 这样的信息可能会被放在 [Pod](https://kubernetes.io/zh-cn/docs/concepts/workloads/pods/) 规约中或者镜像中。 使用 Secret 意味着你不需要在应用程序代码中包含机密数据。

由于创建 Secret 可以独立于使用它们的 Pod， 因此在创建、查看和编辑 Pod 的工作流程中暴露 Secret（及其数据）的风险较小。 Kubernetes 和在集群中运行的应用程序也可以对 Secret 采取额外的预防措施， 例如避免将机密数据写入非易失性存储。

Secret 类似于 [ConfigMap](https://kubernetes.io/zh-cn/docs/tasks/configure-pod-container/configure-pod-configmap/) 但专门用于保存机密数据。

> **注意**: 默认情况下，Kubernetes Secret 未加密地存储在 API 服务器的底层数据存储（etcd）中。 任何拥有 API 访问权限的人都可以检索或修改 Secret，任何有权访问 etcd 的人也可以。 此外，任何有权限在命名空间中创建 Pod 的人都可以使用该访问权限读取该命名空间中的任何 Secret； 这包括间接访问，例如创建 Deployment 的能力。

为了安全地使用 Secret，请至少执行以下步骤：

1. 为 Secret [启用静态加密](https://kubernetes.io/zh-cn/docs/tasks/administer-cluster/encrypt-data/)。
2. 以最小特权访问 Secret 并[启用或配置 RBAC 规则](https://kubernetes.io/zh-cn/docs/reference/access-authn-authz/authorization/)。
3. 限制 Secret 对特定容器的访问。
4. [考虑使用外部 Secret 存储驱动](https://secrets-store-csi-driver.sigs.k8s.io/concepts.html#provider-for-the-secrets-store-csi-driver)。

### Secret的使用

Pod 可以用三种方式之一来使用 Secret：

- 作为挂载到一个或多个容器上的[卷](https://kubernetes.io/zh-cn/docs/concepts/storage/volumes/) 中的[文件](https://kubernetes.io/zh-cn/docs/concepts/configuration/secret/#using-secrets-as-files-from-a-pod)。
- 作为[容器的环境变量](https://kubernetes.io/zh-cn/docs/concepts/configuration/secret/#using-secrets-as-environment-variables)。
- 由 [kubelet 在为 Pod 拉取镜像时使用](https://kubernetes.io/zh-cn/docs/concepts/configuration/secret/#using-imagepullsecrets)。

Kubernetes控制面也使用 Secret； 例如，[引导令牌 Secret](https://kubernetes.io/zh-cn/docs/concepts/configuration/secret/#bootstrap-token-secrets) 是一种帮助自动化节点注册的机制。

`Secret` 主要使用的有以下三种类型：

- `Opaque`：base64 编码格式的 Secret，用来存储密码、密钥等；但数据也可以通过`base64 –decode`解码得到原始数据，所有加密性很弱。
- `kubernetes.io/dockerconfigjson`：用来存储私有`docker registry`的认证信息。
- `kubernetes.io/service-account-token`：用于 `ServiceAccount`, ServiceAccount 创建时 Kubernetes 会默认创建一个对应的 Secret 对象，Pod 如果使用了 ServiceAccount，对应的 Secret 会自动挂载到 Pod 目录 `/run/secrets/kubernetes.io/serviceaccount` 中。
- `bootstrap.kubernetes.io/token`：用于节点接入集群的校验的 Secret

### Opaque Secret的使用

`Opaque` 类型的数据是一个 map 类型，要求 value 必须是 `base64` 编码格式，比如我们来创建一个用户名为 admin，密码为 admin321 的 `Secret` 对象，首先我们需要先把用户名和密码做 `base64` 编码：

```bash
[root@Online-Beijing-master1 ~]# echo -n "admin321" | base64
YWRtaW4zMjE=
```

然后我们就可以利用上面编码过后的数据来编写一个 YAML 文件：(opaque-demo.yaml)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: base-user-info
type: Opaque
data:
  username: YWRtaW4=
  password: YWRtaW4zMjE=
```

创建好 `Secret`对象后，有两种方式来使用它：

- 以环境变量的形式
- 以Volume的形式挂载

### 通过环境变量挂载Secret

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-web-beijing
  namespace: default
  labels:
    k8s-app: nginx-web
    zone: beijing
spec:
  replicas: 1
  selector:
    matchLabels:
      k8s-app: nginx-web
  template:
    metadata:
      name: nginx-web-beijing
      labels:
        k8s-app: nginx-web
    spec:
      containers:
        - name: vue-shop-beijing
          image: nginx:latest
          resources:
            requests:
              memory: 100Mi
              cpu: 10m
          env:
          - name: USERNAME
            valueFrom: 
              secretKeyRef:
                name: base-user-info
                key: username
          - name: PASSWORD
            valueFrom: 
              secretKeyRef:
                name: base-user-info
                key: password
```

### 通过Volume挂载

Secret 把两个 key 挂载成了两个对应的文件。当然如果想要挂载到指定的文件上面，是不是也可以使用上一节课的方法：在 `secretName` 下面添加 `items` 指定 `key` 和 `path`

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secret2-pod
spec:
  containers:
  - name: secret2
    image: busybox
    command: ["/bin/sh", "-c", "ls /etc/secrets"]
    volumeMounts:
    - name: secrets
      mountPath: /etc/secrets
  volumes:
  - name: secrets
    secret:
     secretName: base-user-info
```

一般来说Pod默认的访问`API Server`的Token都会挂载到`/var/run/secrets/kubernetes.io/serviceaccount`当中,利用自带的`token`和`ca.crt`，默认情况下所有的Pod都会被注入当前`namespace`下的`token`和`ca.crt`这样以来就可以去访问APIServer了

```bash
root@nginx-web-beijing-87c9f478f-knrfp:/var/run/secrets/kubernetes.io/serviceaccount# ls
ca.crt  namespace  token
```

### [kubernetes.io/dockerconfigjson](http://kubernetes.io/dockerconfigjson)

除了上面的 `Opaque` 这种类型外，我们还可以来创建用户 `docker registry` 认证的 `Secret`，直接使用`kubectl create` 命令创建即可，如下：

```bash
kubectl create secret docker-registry beijing-harbor --docker-server=DOCKER_SERVER --docker-username=DOCKER_USER --docker-password=DOCKER_PASSWORD --docker-email=DOCKER_EMAIL

kubectl create secret docker-registry beijing-harbor --docker-server=127.0.0.1 --docker-username=admin --docker-password=123123 --docker-email=beilanzhisen@163.com
```

除了上面这种方法之外，我们也可以通过指定文件的方式来创建镜像仓库认证信息，需要注意对应的 `KEY` 和 `TYPE`：

```bash
kubectl create secret generic beijing-harbor --from-file=.dockerconfigjson=/root/.docker/config.json --type=kubernetes.io/dockerconfigjson
```

如果我们需要拉取私有仓库中的 Docker 镜像的话就需要使用到上面的 myregistry 这个 `Secret`：

```yaml
piVersion: apps/v1
kind: Deployment
metadata:
  name: foo
spec:
  containers:
  - name: foo
    image: 192.168.1.100:5000/test:v1
  imagePullSecrets:
  - name: beijing-harbor
```

`ImagePullSecrets` 与 `Secrets` 不同，因为 `Secrets` 可以挂载到 Pod 中，但是 `ImagePullSecrets` 只能由 Kubelet 访问。

## ServiceAccount

`ServiceAccount` 主要是用于解决 Pod 在集群中的身份认证问题的。认证使用的授权信息其实就是利用前面我们讲到的一个类型为 `kubernetes.io/service-account-token` 进行管理的。

`ServiceAccount` 是命名空间级别的，每一个命名空间创建的时候就会自动创建一个名为 `default` 的 `ServiceAccount` 对象:

```bash
kubectl create ns kube-test
kubectl get secret -n kube-test
NAME                  TYPE                                  DATA   AGE
default-token-vn4tr   kubernetes.io/service-account-token   3      2m27s
```

### 实现原理

```yaml
apiVersion: v1
data:
  ca.crt: LS0tLS...
  namespace: a3ViZS10ZXN0
  token: ZXlKaG...
kind: Secret
metadata:
  annotations:
    kubernetes.io/service-account.name: default
    kubernetes.io/service-account.uid: 75b3314b-e949-4f7b-9450-9bcd89c8c972
  creationTimestamp: "2019-11-23T04:19:47Z"
  name: default-token-vn4tr
  namespace: kube-test
  resourceVersion: "4297521"
  selfLink: /api/v1/namespaces/kube-test/secrets/default-token-vn4tr
  uid: e3e60f95-f255-471b-a6c0-600a3c0ee53a
type: kubernetes.io/service-account-token
```

在 `data` 区域我们可以看到有3个信息：

- `ca.crt`：用于校验服务端的证书信息
- `namespace`：表示当前管理的命名空间
- `token`：用于 Pod 身份认证的 Token

前面我们也提到了默认情况下当前 namespace 下面的 Pod 会默认使用 `default` 这个 ServiceAccount，对应的 `Secret` 会自动挂载到 Pod 的 `/var/run/secrets/kubernetes.io/serviceaccount/` 目录中，这样我们就可以在 Pod 里面获取到用于身份认证的信息了。

实际上这个自动挂载过程是在 Pod 创建的时候通过 `Admisson Controller（准入控制器）` 来实现的，关于准入控制器的详细信息我们会在后面的安全章节中和大家继续学习。

> `Admission Controller（准入控制）`是 Kubernetes API Server 用于拦截请求的一种手段。`Admission` 可以做到对请求的资源对象进行校验，修改，Pod 创建时 `Admission Controller` 会根据指定的的 `ServiceAccount`（默认的 default）把对应的 `Secret` 挂载到容器中的固定目录下 `/var/run/secrets/kubernetes.io/serviceaccount/`。