---
title: kubernetes基于EFK的日志落地实现
tags:
  - kubernetes
categories:
  - kubernetes
images: 
  - https://fc.sinaimg.cn/large/005Czbxjgy1hkmevv8ozyj31ds0iqn0i.jpg
date: 2023-12-08 00:00:00
url: "kubernetes/efk"
---

Kubernetes 中比较流行的日志收集解决方案是 `Elasticsearch`、`Fluentd` 和 `Kibana`（EFK）技术栈，也是官方现在比较推荐的一种方案。

`Elasticsearch` 是一个实时的、分布式的可扩展的搜索引擎，允许进行全文、结构化搜索，它通常用于索引和搜索大量日志数据，也可用于搜索许多不同类型的文档。

`Elasticsearch` 通常与 `Kibana` 一起部署，`Kibana` 是 `Elasticsearch` 的一个功能强大的数据可视化 Dashboard，`Kibana` 允许你通过 web 界面来浏览`Elasticsearch` 日志数据。

`Fluentd`是一个流行的开源数据收集器，我们将在 Kubernetes 集群节点上安装 `Fluentd`，通过获取容器日志文件、过滤和转换日志数据，然后将数据传递到 Elasticsearch 集群，在该集群中对其进行索引和存储。

我们先来配置启动一个可扩展的 Elasticsearch 集群，然后在 Kubernetes 集群中创建一个 Kibana 应用，最后通过 DaemonSet 来运行 Fluentd，以便它在每个 Kubernetes 工作节点上都可以运行一个 Pod。
## 安装 Elasticsearch 集群
先创建一个命名空间，我们将在其中安装所有日志相关的资源对象。
```bash
kubectl create ns kube-logging
```
### 环境准备
`ElasticSearch` 安装有最低安装要求，如果安装后 Pod 无法正常启动，请检查是否符合最低要求的配置，要求如下：

| 节点                 | CPU最低要求 | 内存最低要求 |
| -------------------- | ----------- | ------------ |
| elasticsearch-master | 核心数>2    | 内存>2G      |
| elasticsearch-data   | 核心数>1    | 内存>2G      |
| elasticsearch-client | 核心数>1    | 内存>2G      |

集群节点信息

| 集群                 | 节点类型 | 副本数目 | 存储大小 | 网络模式  | 描述             |
| -------------------- | -------- | -------- | -------- | --------- | ---------------- |
| elasticsearch        | master   | 3        | 5Gi      | ClusterIP | 主节点           |
| elasticsearch-data   | data     | 3        | 50Gi     | ClusterIP | 数据节点         |
| elasticsearch-client | client   | 2        | 无       | NodePort  | 负责处理用户请求 |

> 建议使用 `StorageClass` 来做持久化存储，当然如果你是线上环境建议使用 Local PV 或者 Ceph RBD 之类的存储来持久化 Elasticsearch 的数据。

由于 ElasticSearch 7.x 版本默认安装了 X-Pack 插件，并且部分功能免费，需要我们配置一些安全证书文件。
### 准备生成证书文件
> 注意：由于我们采用的是`containerd`所以使用`nerdctl`来运行一个容器
```bash
mkdir -p elastic-certs
nerdctl run --name elastic-certs -v elastic-certs:/app -it -w /app elasticsearch:7.17.3 /bin/sh -c  \
  "elasticsearch-certutil ca --out /app/elastic-stack-ca.p12 --pass '' && \
    elasticsearch-certutil cert --name security-master --dns \
    security-master --ca /app/elastic-stack-ca.p12 --pass '' --ca-pass '' --out /app/elastic-certificates.p12"
# 找到nerdctl挂载的目录
cd /var/lib/nerdctl/1935db59/volumes/default/elastic-certs/_data/ # 这个每个人是不一样的 可以自己搜索一下

mv * /root/elastic-certs/
cd /root/elastic-certs/ && openssl pkcs12 -nodes -passin pass:'' -in elastic-certificates.p12 -out elastic-certificate.pem
```
2. 添加证书到`kubernetes`
```bash
kubectl create secret -n kube-logging generic elastic-certs --from-file=elastic-certificates.p12
# 设置集群用户名和密码
kubectl create secret -n kube-logging generic elastic-auth --from-literal=username=elastic --from-literal=password=elastic-master
```

### 准备安装Elastic集群
1. 采用`Helm`的方式来添加`elasticsearch`仓库
```bash
helm repo add elastic https://helm.elastic.co
helm repo update
```
ElaticSearch 安装需要安装三次，分别安装 Master、Data、Client 节点，Master 节点负责集群间的管理工作；Data 节点负责存储数据；Client 节点负责代理 ElasticSearch Cluster 集群，负载均衡。
2. 拉取elasticsearch
```bash
helm pull elastic/elasticsearch --untar --version 7.17.3
cd elasticsearch/
```
在Chart目录下创建对应节点节点的`values`文件
以下是`master-value.yaml`
```yaml
# 设置集群名称
clusterName: "elasticsearch"
# 设置节点名称
nodeGroup: "master"
# 设置角色
roles:
  master: "true"
  ingest: "false"
  data: "false"

# 镜像
image: "docker.elastic.co/elasticsearch/elasticsearch"
imageTag: "7.17.3"
imagePullPolicy: "IfNotPresent"
# 副本数
replicas: 3

# ---资源配置---
esJavaOpts: "-Xmx1g -Xms1g"
resources:
  requests:
    cpu: "2000m"
    memory: "2Gi"
  limits:
    cpu: "2000m"
    memory: "2Gi"
# 数据持久卷配置
persistence:
  enabled: true
# 存储数据大小配置
volumeClaimTemplate:
  storageClassName: managed-nfs-storage # 定义你自己的存储类
  accessModes: ['ReadWriteOnce']
  resources:
    requests:
      storage: 5Gi

# ---安全设置---
# 设置协议，可配置为 http、https
protocol: http
# 证书挂载配置，这里我们挂入上面创建的证书
secretMounts:
  - name: elastic-certs
    secretName: elastic-certs
    path: /usr/share/elasticsearch/config/certs
    defaultMode: 0755

# 允许您在/usr/share/elasticsearch/config/中添加任何自定义配置文件,例如 elasticsearch.yml、log4j2.properties
# ElasticSearch 7.x 默认安装了 x-pack 插件，部分功能免费，这里我们配置下
# 下面注掉的部分为配置 https 证书，配置此部分还需要配置 helm 参数 protocol 值改为 https
esConfig:
  elasticsearch.yml: |
    xpack.security.enabled: true
    xpack.security.transport.ssl.enabled: true
    xpack.security.transport.ssl.verification_mode: certificate
    xpack.security.transport.ssl.keystore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    xpack.security.transport.ssl.truststore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    # xpack.security.http.ssl.enabled: true
    # xpack.security.http.ssl.truststore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    # xpack.security.http.ssl.keystore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
# 环境变量配置，这里引入上面设置的用户名、密码 secret 文件
extraEnvs:
  - name: ELASTIC_USERNAME
    valueFrom:
      secretKeyRef:
        name: elastic-auth
        key: username
  - name: ELASTIC_PASSWORD
    valueFrom:
      secretKeyRef:
        name: elastic-auth
        key: password

# ---调度设置---
# 设置调度策略
# - hard：只有当有足够的节点时 Pod 才会被调度，并且它们永远不会出现在同一个节点上
# - soft：尽最大努力调度
antiAffinity: 'soft'
tolerations:
   - operator: "Exists" # 容忍全部污点
```
以下是`data-value.yaml`的内容
```yaml
# 设置集群名称
clusterName: "elasticsearch"
# 设置节点名称
nodeGroup: "data"
# 设置角色
roles:
  master: "false"
  ingest: "true"
  data: "true"

# 镜像
image: "docker.elastic.co/elasticsearch/elasticsearch"
imageTag: "7.17.3"
imagePullPolicy: "IfNotPresent"
# 副本数
replicas: 3

# ---资源配置---
esJavaOpts: "-Xmx1g -Xms1g"
resources:
  requests:
    cpu: "1000m"
    memory: "2Gi"
  limits:
    cpu: "1000m"
    memory: "2Gi"
# 数据持久卷配置
persistence:
  enabled: true
# 存储数据大小配置
volumeClaimTemplate:
  storageClassName: managed-nfs-storage # 定义你自己的存储类
  accessModes: ['ReadWriteOnce']
  resources:
    requests:
      storage: 20Gi

# ---安全设置---
# 设置协议，可配置为 http、https
protocol: http
# 证书挂载配置，这里我们挂入上面创建的证书
secretMounts:
  - name: elastic-certs
    secretName: elastic-certs
    path: /usr/share/elasticsearch/config/certs
    defaultMode: 0755

# 允许您在/usr/share/elasticsearch/config/中添加任何自定义配置文件,例如 elasticsearch.yml、log4j2.properties
# ElasticSearch 7.x 默认安装了 x-pack 插件，部分功能免费，这里我们配置下
# 下面注掉的部分为配置 https 证书，配置此部分还需要配置 helm 参数 protocol 值改为 https
esConfig:
  elasticsearch.yml: |
    xpack.security.enabled: true
    xpack.security.transport.ssl.enabled: true
    xpack.security.transport.ssl.verification_mode: certificate
    xpack.security.transport.ssl.keystore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    xpack.security.transport.ssl.truststore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    # xpack.security.http.ssl.enabled: true
    # xpack.security.http.ssl.truststore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    # xpack.security.http.ssl.keystore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
# 环境变量配置，这里引入上面设置的用户名、密码 secret 文件
extraEnvs:
  - name: ELASTIC_USERNAME
    valueFrom:
      secretKeyRef:
        name: elastic-auth
        key: username
  - name: ELASTIC_PASSWORD
    valueFrom:
      secretKeyRef:
        name: elastic-auth
        key: password

```
以下是`client-value.yaml`
```yaml
# 设置集群名称
clusterName: "elasticsearch"
# 设置节点名称
nodeGroup: "client"
# 设置角色
roles:
  master: "false"
  ingest: "false"
  data: "false"

# 镜像
image: "docker.elastic.co/elasticsearch/elasticsearch"
imageTag: "7.17.3"
imagePullPolicy: "IfNotPresent"
# 副本数
replicas: 1

# ---资源配置---
esJavaOpts: "-Xmx1g -Xms1g"
resources:
  requests:
    cpu: "1000m"
    memory: "2Gi"
  limits:
    cpu: "1000m"
    memory: "2Gi"
# 数据持久卷配置
persistence:
  enabled: false
# ---安全设置---
# 设置协议，可配置为 http、https
protocol: http
# 证书挂载配置，这里我们挂入上面创建的证书
secretMounts:
  - name: elastic-certs
    secretName: elastic-certs
    path: /usr/share/elasticsearch/config/certs
    defaultMode: 0755

# 允许您在/usr/share/elasticsearch/config/中添加任何自定义配置文件,例如 elasticsearch.yml、log4j2.properties
# ElasticSearch 7.x 默认安装了 x-pack 插件，部分功能免费，这里我们配置下
# 下面注掉的部分为配置 https 证书，配置此部分还需要配置 helm 参数 protocol 值改为 https
esConfig:
  elasticsearch.yml: |
    xpack.security.enabled: true
    xpack.security.transport.ssl.enabled: true
    xpack.security.transport.ssl.verification_mode: certificate
    xpack.security.transport.ssl.keystore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    xpack.security.transport.ssl.truststore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    # xpack.security.http.ssl.enabled: true
    # xpack.security.http.ssl.truststore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    # xpack.security.http.ssl.keystore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
# 环境变量配置，这里引入上面设置的用户名、密码 secret 文件
extraEnvs:
  - name: ELASTIC_USERNAME
    valueFrom:
      secretKeyRef:
        name: elastic-auth
        key: username
  - name: ELASTIC_PASSWORD
    valueFrom:
      secretKeyRef:
        name: elastic-auth
        key: password
        
# ----服务设置----
service:
  type: NodePort
  nodePort: '30200'
```
3. 开始部署相关节点
```bash
helm upgrade --install elasticsearch-master -f master-values.yaml --namespace kube-logging ./ # 部署master
helm upgrade --install elasticsearch-data -f data-values.yaml --namespace kube-logging ./ # 部署data
helm upgrade --install elasticsearch-client -f client-values.yaml --namespace kube-logging ./  # 部署 client
```
正常情况下看到所有节点都处于`running`状态即可
```bash
[root@Online-Beijing-master1 elasticsearch]# kubectl get pods -n kube-logging
NAME                     READY   STATUS    RESTARTS   AGE
elasticsearch-client-0   1/1     Running   0          13m
elasticsearch-data-0     1/1     Running   0          17m
elasticsearch-data-1     1/1     Running   0          17m
elasticsearch-data-2     1/1     Running   0          17m
elasticsearch-master-0   1/1     Running   0          43m
elasticsearch-master-1   1/1     Running   0          43m
elasticsearch-master-2   1/1     Running   0          43m
```

## 安装Kibana
依旧使用`helm`的方式进行部署
1. 使用`helm pull`拉取`Kibana`包来进行解压
```bash
helm pull elastic/kibana --untar --version 7.17.3
cd kibana
```
2. 定义一个名字为`custom-value.yaml`的文件
```yaml
# 指定镜像与镜像版本
image: 'kibana'
imageTag: '7.17.3'

# 配置 ElasticSearch 地址
elasticsearchHosts: 'http://elasticsearch-client:9200'

# 环境变量配置，这里引入上面设置的用户名、密码 secret 文件
extraEnvs:
  - name: 'ELASTICSEARCH_USERNAME'
    valueFrom:
      secretKeyRef:
        name: elastic-auth
        key: username
  - name: 'ELASTICSEARCH_PASSWORD'
    valueFrom:
      secretKeyRef:
        name: elastic-auth
        key: password
resources:
  requests:
    cpu: '500m'
    memory: '1Gi'
  limits:
    cpu: '500m'
    memory: '1Gi'
# kibana 配置中添加语言配置，设置 kibana 为中文
kibanaConfig:
  kibana.yml: |
    i18n.locale: "zh-CN"
service:
  type: NodePort
  nodePort: '30601'
```
3. 部署`kibana`
```bash
helm install kibana -f custom-value.yaml --namespace kube-logging .
```

## 部署Fluentd
Fluentd 是一个高效的日志聚合器，是用 Ruby 编写的，并且可以很好地扩展。对于大部分企业来说，Fluentd 足够高效并且消耗的资源相对较少，另外一个工具 `Fluent-bit` 更轻量级，占用资源更少，但是插件相对 Fluentd 来说不够丰富，所以整体来说，Fluentd 更加成熟，使用更加广泛，所以这里我们使用 Fluentd 来作为日志收集工具。

### 工作原理
Fluentd 通过一组给定的数据源抓取日志数据，处理后（转换成结构化的数据格式）将它们转发给其他服务，比如 Elasticsearch、对象存储等等。Fluentd 支持超过 300 个日志存储和分析服务，所以在这方面是非常灵活的。主要运行步骤如下：
- 首先 Fluentd 从多个日志源获取数据
- 结构化并且标记这些数据
- 然后根据匹配的标签将数据发送到多个目标服务去
- [官方文档](https://docs.fluentd.org/quickstart)

![image.png](https://img14.360buyimg.com/ddimg/jfs/t1/177175/31/35833/30306/64cb08eeF5ba90f46/1da6311bbbec8921.jpg)

### 日志源配置
比如我们这里为了收集 Kubernetes 节点上的所有容器日志，就需要做如下的日志源配置：
- id：表示引用该日志源的唯一标识符，该标识可用于进一步过滤和路由结构化日志数据
- type：Fluentd 内置的指令，tail 表示 Fluentd 从上次读取的位置通过 tail 不断获取数据，另外一个是 http 表示通过一个 GET 请求来收集数据。
- path：`tail` 类型下的特定参数，告诉 Fluentd 采集 /var/log/containers 目录下的所有日志，这是 docker 在 Kubernetes 节点上用来存储运行容器 stdout 输出日志数据的目录。
- pos_file：检查点，如果 Fluentd 程序重新启动了，它将使用此文件中的位置来恢复日志数据收集。
- tag：用来将日志源与目标或者过滤器匹配的自定义字符串，Fluentd 匹配源/目标标签来路由日志数据。
```conf
<source>
  @id fluentd-containers.log
  @type tail                             # Fluentd 内置的输入方式，其原理是不停地从源文件中获取新的日志,类似于tail命令
  path /var/log/containers/*.log         # 挂载的宿主机容器日志地址
  pos_file /var/log/es-containers.log.pos
  tag raw.kubernetes.*                   # 设置日志标签
  read_from_head true
  <parse>                                # 多行格式化成JSON
    @type multi_format                   # 使用 multi-format-parser 解析器插件
    <pattern>
      format json                        # JSON 解析器
      time_key time                      # 指定事件时间的时间字段
      time_format %Y-%m-%dT%H:%M:%S.%NZ  # 时间格式
    </pattern>
    <pattern>
      format /^(?<time>.+) (?<stream>stdout|stderr) [^ ]* (?<log>.*)$/
      time_format %Y-%m-%dT%H:%M:%S.%N%:z
    </pattern>
  </parse>
</source>
```

### 过滤
由于 Kubernetes 集群中应用太多，也还有很多历史数据，所以我们可以只将某些应用的日志进行收集，比如我们只采集具有` discovery-log=true` 这个 Label 标签的 Pod 日志，这个时候就需要使用 filter。
```conf
# 删除无用的属性
<filter kubernetes.**>
  @type record_transformer
  remove_keys $.docker.container_id,$.kubernetes.container_image_id,$.kubernetes.pod_id,$.kubernetes.namespace_id,$.kubernetes.master_url,$.kubernetes.labels.pod-template-hash
</filter>
# 只保留具有discovery-log=true标签的Pod日志
<filter kubernetes.**>
  @id filter_log
  @type grep
  <regexp>
    key $.kubernetes.labels.discovery-log
    pattern ^true$
  </regexp>
</filter>
```
### 路由设置
```conf
<match **>
  @id elasticsearch
  @type elasticsearch
  @log_level info
  include_tag_key true
  type_name fluentd
  host "#{ENV['OUTPUT_HOST']}"
  port "#{ENV['OUTPUT_PORT']}"
  logstash_format true
  <buffer>
    @type file
    path /var/log/fluentd-buffers/kubernetes.system.buffer
    flush_mode interval
    retry_type exponential_backoff
    flush_thread_count 2
    flush_interval 5s
    retry_forever
    retry_max_interval 30
    chunk_limit_size "#{ENV['OUTPUT_BUFFER_CHUNK_LIMIT']}"
    queue_limit_length "#{ENV['OUTPUT_BUFFER_QUEUE_LIMIT']}"
    overflow_action block
  </buffer>
</match>
```
- match：标识一个目标标签，后面是一个匹配日志源的正则表达式，我们这里想要捕获所有的日志并将它们发送给 Elasticsearch，所以需要配置成**。
- id：目标的一个唯一标识符。
- type：支持的输出插件标识符，我们这里要输出到 Elasticsearch，所以配置成 elasticsearch，这是 Fluentd 的一个内置插件。
- log_level：指定要捕获的日志级别，我们这里配置成 info，表示任何该级别或者该级别以上（INFO、WARNING、ERROR）的日志都将被路由到 Elsasticsearch。
- host/port：定义 Elasticsearch 的地址，也可以配置认证信息，我们的 Elasticsearch 不需要认证，所以这里直接指定 host 和 port 即可。
- logstash_format：Elasticsearch 服务对日志数据构建反向索引进行搜索，将 logstash_format 设置为 true，Fluentd 将会以 logstash 格式来转发结构化的日志数据。
- Buffer： Fluentd 允许在目标不可用时进行缓存，比如，如果网络出现故障或者 Elasticsearch 不可用的时候。缓冲区配置也有助于降低磁盘的 IO。
### 开始部署Fluentd
要收集 Kubernetes 集群的日志，直接用`DasemonSet` 控制器来部署 Fluentd 应用，这样，它就可以从 Kubernetes 节点上采集日志，确保在集群中的每个节点上始终运行一个 Fluentd 容器。当然可以直接使用 Helm 来进行一键安装，为了能够了解更多实现细节，我们这里还是采用手动方法来进行安装。
- [安装文档]( https://docs.fluentd.org/container-deployment/kubernetes)

1. 首先创建`fluentd`的`configmap`
```yaml
# fluentd-configmap.yaml
kind: ConfigMap
apiVersion: v1
metadata:
  name: fluentd-conf
  namespace: kube-logging
data:
  # containerd的容器日志
  containerd.input.conf: |-
    <source>
      @id containerd-fluentd-beta.log         # 唯一Id：运行时+收集插件+环境
      @type tail                              # Fluentd 内置的输入方式，其原理是不停地从源文件中获取新的日志
      path /var/log/containers/*.log          # Docker 容器日志路径
      pos_file /var/log/es-containers.log.pos  # 记录读取的位置
      tag raw.kubernetes.*                    # 设置日志标签
      read_from_head true                     # 从头读取
      <parse>                                 # 多行格式化成JSON
        # 可以使用我们介绍过的 multiline 插件实现多行日志
        @type multi_format                    # 使用 multi-format-parser 解析器插件
        <pattern>
          format json                         # JSON解析器
          time_key time                       # 指定事件时间的时间字段
          time_format %Y-%m-%dT%H:%M:%S.%NZ   # 时间格式
        </pattern>
        <pattern>
          format /^(?<time>.+) (?<stream>stdout|stderr) [^ ]* (?<log>.*)$/
          time_format %Y-%m-%dT%H:%M:%S.%N%:z
        </pattern>
      </parse>
    </source>

    # 在日志输出中检测异常(多行日志)，并将其作为一条日志转发
    # https://github.com/GoogleCloudPlatform/fluent-plugin-detect-exceptions
    <match raw.kubernetes.**>           # 匹配tag为raw.kubernetes.**日志信息
      @id raw.kubernetes
      @type detect_exceptions           # 使用detect-exceptions插件处理异常栈信息
      remove_tag_prefix raw             # 移除 raw 前缀
      message log
      multiline_flush_interval 5
    </match>

    <filter **>  # 拼接日志
      @id filter_concat
      @type concat                # Fluentd Filter 插件，用于连接多个日志中分隔的多行日志
      key message
      multiline_end_regexp /\n$/  # 以换行符“\n”拼接
      separator ""
    </filter>

    # 添加 Kubernetes metadata 数据
    <filter kubernetes.**>
      @id filter_kubernetes_metadata
      @type kubernetes_metadata
    </filter>

    # 修复 ES 中的 JSON 字段
    # 插件地址：https://github.com/repeatedly/fluent-plugin-multi-format-parser
    <filter kubernetes.**>
      @id filter_parser
      @type parser                # multi-format-parser多格式解析器插件
      key_name log                # 在要解析的日志中指定字段名称
      reserve_data true           # 在解析结果中保留原始键值对
      remove_key_name_field true  # key_name 解析成功后删除字段
      <parse>
        @type multi_format
        <pattern>
          format json
        </pattern>
        <pattern>
          format none
        </pattern>
      </parse>
    </filter>

    # 删除一些多余的属性
    <filter kubernetes.**>
      @type record_transformer
      remove_keys $.docker.container_id,$.kubernetes.container_image_id,$.kubernetes.pod_id,$.kubernetes.namespace_id,$.kubernetes.master_url,$.kubernetes.labels.pod-template-hash
    </filter>

    # 只保留具有kubernetes.log.kubernetes.log/fluentd标签的Pod日志
    <filter kubernetes.**>
      @id filter_log
      @type grep
      <regexp>
        key $.kubernetes.labels.kubernetes.log/fluentd
        pattern ^true$
      </regexp>
    </filter>

  ###### 监听配置，一般用于日志聚合用 ######
  forward.input.conf: |-
    # 监听通过TCP发送的消息
    <source>
      @id forward
      @type forward
    </source>

  output.conf: |-
    <match **>
      @id elasticsearch
      @type elasticsearch
      @log_level info
      include_tag_key true
      host elasticsearch-client
      port 9200
      user elastic # FLUENT_ELASTICSEARCH_USER | FLUENT_ELASTICSEARCH_PASSWORD
      password elastic-master
      logstash_format true
      logstash_prefix kubernetes-cluster
      request_timeout 30s
      <buffer>
        @type file
        path /var/log/fluentd-buffers/kubernetes.system.buffer
        flush_mode interval
        retry_type exponential_backoff
        flush_thread_count 2
        flush_interval 5s
        retry_forever
        retry_max_interval 30
        chunk_limit_size 2M
        queue_limit_length 8
        overflow_action block
      </buffer>
    </match>
```
2. 创建相关的Rbac权限
```yaml
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: fluentd
  namespace: kube-logging

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: fluentd
rules:
- apiGroups:
  - ""
  resources:
  - pods
  - namespaces
  verbs:
  - get
  - list
  - watch

---
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: fluentd
roleRef:
  kind: ClusterRole
  name: fluentd
  apiGroup: rbac.authorization.k8s.io
subjects:
- kind: ServiceAccount
  name: fluentd
  namespace: kube-logging
```
3. 创建`fluentd`的`daemonset`
> 这个是最新的版本还在研究中,用下面的版本。
```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: kube-logging
  labels:
    k8s-app: fluentd-logging
    version: v1
spec:
  selector:
    matchLabels:
      k8s-app: fluentd-logging
      version: v1
  template:
    metadata:
      labels:
        k8s-app: fluentd-logging
        version: v1
    spec:
      serviceAccount: fluentd
      serviceAccountName: fluentd
      tolerations:
      - key: node-role.kubernetes.io/control-plane
        effect: NoSchedule
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      containers:
      - name: fluentd
        image: fluent/fluentd-kubernetes-daemonset:v1-debian-elasticsearch
        env:
          - name: K8S_NODE_NAME
            valueFrom:
              fieldRef:
                fieldPath: spec.nodeName
          - name:  FLUENT_ELASTICSEARCH_HOST
            value: "elasticsearch-client-headless.kube-logging.svc.cluster.local"
          - name:  FLUENT_ELASTICSEARCH_PORT
            value: "9200"
          - name: FLUENT_ELASTICSEARCH_SCHEME
            value: "http"
          # Option to configure elasticsearch plugin with self signed certs
          # ================================================================
          - name: FLUENT_ELASTICSEARCH_SSL_VERIFY
            value: "true"
          # Option to configure elasticsearch plugin with tls
          # ================================================================
          - name: FLUENT_ELASTICSEARCH_SSL_VERSION
            value: "TLSv1_2"
          # X-Pack Authentication
          # =====================
          - name: FLUENT_ELASTICSEARCH_USER
            value: "elastic"
          - name: FLUENT_ELASTICSEARCH_PASSWORD
            value: "elastic-master"
		  - name: FLUENT_ELASTICSEARCH_LOGSTASH_PREFIX
		    value: "kubernetes-cluster"
        resources:
          limits:
            memory: 200Mi
          requests:
            cpu: 100m
            memory: 200Mi
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: fluentconfig
          mountPath: /fluentd/etc/custom
        - name: dockercontainerlogdirectory
          mountPath: /var/log/pods
          readOnly: true
      terminationGracePeriodSeconds: 30
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: fluentconfig
        configMap:
          name: fluentd-conf
      - name: dockercontainerlogdirectory
        hostPath:
          path: /var/log/pods
```
麻烦用下面的进行部署
```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: kube-logging
  labels:
    app: fluentd
    kubernetes.io/cluster-service: 'true'
spec:
  selector:
    matchLabels:
      app: fluentd
  template:
    metadata:
      labels:
        app: fluentd
        kubernetes.io/cluster-service: 'true'
    spec:
      tolerations:
        - key: node-role.kubernetes.io/master
          effect: NoSchedule
      serviceAccountName: fluentd
      containers:
        - name: fluentd
          image: quay.io/fluentd_elasticsearch/fluentd:v3.4.0
          volumeMounts:
            - name: fluentconfig
              mountPath: /etc/fluent/config.d
            - name: varlog
              mountPath: /var/log
      volumes:
        - name: fluentconfig
          configMap:
            name: fluentd-conf
        - name: varlog
          hostPath:
            path: /var/log
```

## 关于保留指定标签的问题

部署完成以后我发现一直有一个小问题，就是无论我如何设置`label`都无法让`elasticsearch`获取到正常的数据。

根据这个问题，我进行了更细致的排查。现在得出了如下的结论。

1. 可能是由于我对知识的缺乏，我定义的是`Deployment`当中的`label`标签，但是这个`label`标识只作用于`Deployment`本身，通常用作`kubernete`集群中的选择器匹配，例如我们的`Service`要去匹配某个`Deployment`。
2. 关于`spec.template.metadata.labels`，我发现这个才是我们正确要匹配的`label`标签选项，因为这些标签用于标识`Deployment`所创建的`Pod`

3. 所以最后总结出来的问题就是，我们上面的`fluentd`中写的过滤插件` key $.kubernetes.labels.kubernetes.log/fluentd`中所匹配的`label`标签应当是`spec.template.metadata.labels`的`label`

```yaml
spec:
  replicas: 2
  selector:
    matchLabels:
      app: canary
  template:
    metadata:
      creationTimestamp: null
      labels:
        app: canary
        kubernetes.log/fluentd: 'true'
```

