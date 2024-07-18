# 管理好内部的代码仓库-GitLab篇

今天聊聊如何来管理我们的`代码仓库`
在软件开发过程中，代码仓库是一个非常重要的组成部分。它不仅是存储代码的地方，也是团队协作和版本控制的基础。因此，管理好自己的代码仓库至关重要。

本文将介绍如何使用Git来管理自己的代码仓库。

## 部署GitLab
相较于传动的部署方式比较繁琐，我这里直接采用`docker`的部署方式来部署`gitlab`以方便后续管理。

说一下使用Docker来部署的一些痛点：</p>

1. 数据备份：在`Docker`中运行`Gitlab`，需要定期备份数据以防止数据丢失。但是备份数据的过程可能会很麻烦，并且需要设置合适的策略来避免数据丢失。所以这是我觉得不管是`GitLab`还是其他的应用，保证数据的完整可靠性是至关重要的。 </p>
2. 版本更新：`Docker`部署`Gitlab`需要时刻关注版本更新，需要进行升级或者迁移，主要是数据迁移的数据保障工作需要额外注意。

> 好了我们带着上面的两点问题，我们先来使用`docker`部署`GitLab`然后再慢慢探索。

- [DockerCompose](https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64)

1. 我们使用`docker-compose`来部署`gitlab`仓库程序，注意镜像版本。如果你是尊贵的`ee`用户请修改镜像。如果你是普通的`ce`用户直接复制就行。
```yaml
version: '3.6'
services:
  web:
    image: 'gitlab/gitlab-ce:latest'
    restart: always
    # 指定gitlab主机名称
    hostname: 'gitlab.example.com'
    environment:
      GITLAB_OMNIBUS_CONFIG: |
        # gitlab访问地址
        external_url 'http://10.1.6.100'
    ports:
      - '80:80'
      - '443:443'
      - '2212:22' # 防止与本地的22端口进行冲突
    volumes:
      - '/data/gitlab-app/config:/etc/gitlab'
      - '/data/gitlab-app/logs:/var/log/gitlab'
      - '/data/gitlab-app/data:/var/opt/gitlab'
    shm_size: '256m'
```
2. 启动`gitlab`程序
```bash
[root@localhost gitlab-app]# docker-compose up -d
[+] Running 1/1
 ✔ Container gitlab-app-web-1  Started
```
3. 部署完成后的一些相关设置可以参考[官方文档](https://docs.gitlab.com/ee/install/next_steps.html)

实际上到此为止，我们的一个代码仓库就已经创建完成了，剩下的工作就是在UI界面点点点。我就不多赘述了主要讲讲如何备份的问题。


## 如何高效的进行容器备份
- 当然了如果你想保证更安全的数据备份可以在深夜`stop`掉你的代码仓库从而进行停机备份(暂不采取)
- 简单备份和扩展备份

### 简单备份
如果您使用数据量少于 100 GB的可以使用一下三个步骤进行备份
1. 运行备份命令
```bash
GitLab 12.2 或更高版本：
docker exec -t <container name> gitlab-backup create
```
输出示例
```txt
Dumping database tables:
- Dumping table events... [DONE]
- Dumping table issues... [DONE]
- Dumping table keys... [DONE]
- Dumping table merge_requests... [DONE]
- Dumping table milestones... [DONE]
- Dumping table namespaces... [DONE]
- Dumping table notes... [DONE]
- Dumping table projects... [DONE]
- Dumping table protected_branches... [DONE]
- Dumping table schema_migrations... [DONE]
- Dumping table services... [DONE]
- Dumping table snippets... [DONE]
- Dumping table taggings... [DONE]
- Dumping table tags... [DONE]
- Dumping table users... [DONE]
- Dumping table users_projects... [DONE]
- Dumping table web_hooks... [DONE]
- Dumping table wikis... [DONE]
Dumping repositories:
- Dumping repository abcd... [DONE]
Creating backup archive: <backup-id>_gitlab_backup.tar [DONE]
Deleting tmp directories...[DONE]
Deleting old backups... [SKIPPING]
```

这里说明一下关于`备份策略选项`的选项
- 更多地备份选项可以参考[官方文档](https://docs.gitlab.com/ee/administration/backup_restore/backup_gitlab.html?tab=Docker)

`tar`默认备份策略本质上是使用 Linux 命令和将数据从相应的数据位置流式传输到备份`gzip`。这在大多数情况下工作正常，但当数据快速变化时可能会导致问题。

`tar`当读取数据时数据发生变化，`file changed as we read it`可能会发生错误，并导致备份过程失败。在这种情况下，您可以使用名为 的备份策略`copy`。`tar`该策略在调用和之前将数据文件复制到临时位置`gzip`，以避免错误。

副作用是备份过程会额外占用 1X 的磁盘空间。该过程会尽力清理每个阶段的临时文件，因此问题不会变得复杂，但对于大型安装来说，这可能是一个相当大的变化。
要使用该`copy`策略而不是默认的流策略，请 `STRATEGY=copy`在 `Rake` 任务命令中指定。
```bash
docker exec -t <container name> gitlab-backup create STRATEGY=copy
```

2. 考虑将备份出来的相关文件上传到`对象存储`: 例如 S3、`Minio`等程序。

3. 手动备份`gitlab.rb`和`gitlab-secrets.json`。您可能还需要备份所有 TLS 密钥和证书 `/etc/gitlab/ssl`、`/etc/gitlab/trusted-certs` 以及 SSH 主机密钥。

> 如果这两种文件丢失请参考[官方文档](https://docs.gitlab.com/ee/administration/backup_restore/troubleshooting_backup_gitlab.html#when-the-secrets-file-is-lost)


## 恢复保存的数据
首先恢复数据要满足的一些`前提条件`
1. 目标 GitLab 实例必须已在运行
2. 目标 GitLab 实例必须具有完全相同的版本
3. 必须恢复 GitLab 机密配置文件
4. 某些 GitLab 配置必须与原始备份环境匹配：例如TLS证书等内容
5. 恢复作为挂载点的目录：[详细参考](https://docs.gitlab.com/ee/administration/nfs.html)

下面我们来具体看一下如何恢复已经从`gitlab`中备份的数据内容以及仓库等信息。
1. 如果使用`Docker Swarm`，容器可能会在恢复过程中重新启动，因为`Puma`已关闭，因此容器运行状况检查失败。要解决此问题，请暂时禁用运行状况检查机制。
```yaml
# 修改docker-compose.yaml
healthcheck:
  disable: true
```
2. 部署堆栈信息(仅限于`DockerSwarm`)，关于为啥这样做请参考[issuse6846](https://gitlab.com/gitlab-org/omnibus-gitlab/-/issues/6846)
```bash
docker stack deploy --compose-file docker-compose.yml mystack
```
3. 恢复步骤
```bash
# 首先停止puma和sidekiq
docker exec -it <name of container> gitlab-ctl stop puma
docker exec -it <name of container> gitlab-ctl stop sidekiq

# 然后查看gitlab相关组件的状态 puma:down sidekiq:down
docker exec -it <name of container> gitlab-ctl status

# 开始恢复指定的备份文件
docker exec -it <name of container> gitlab-backup restore BACKUP=11493107454_2018_04_25_10.6.4-ce

# 重启你的gitlab
docker-compose restart

# 检查相关的元数据信息
docker exec -it <name of container> gitlab-rake gitlab:check SANITIZE=true
```

这大概就是一个`gitlab`备份完整的恢复过程，当然本文没有涉及到的相关内容可以通过参考官网文档(上面有写)来进行扩充。

