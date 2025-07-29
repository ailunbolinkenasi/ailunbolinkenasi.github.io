---
title: 维扣图元-专属你的拍照摄影社区
tags:
  - Go
  - Gin
categories:
  - 个人项目
description: “维扣图元” 是一款充满创意与活力的拍照摄影社区 APP，为摄影爱好者们打造了一个专属的艺术天地。在这里，你可以用镜头捕捉生活中的每一个精彩瞬间，与全球的摄影达人分享你的独特视角，共同探索摄影艺术的无限可能。无论你是专业摄影师还是业余爱好者，“维扣图元” 都将成为你展现才华、交流心得、发现美的最佳平台。
heroImage: { src: 'https://ydschool-online.nosdn.127.net/tiku/f291c1c8d5dccacd2b95ef4fdc68d07cefd0e92562794e5bcdd21a9729b3455d.jpg',inferSize: true}
publishDate: 2024-10-20 00:00:00
slug: "project/gin-wecho"
---
## 项目简介




- “维扣图元” 是一个充满创意与活力的拍照摄影社区开源项目。旨在为摄影爱好者们提供一个展示作品、交流心得、学习成长的平台。无论你是专业摄影师还是业余爱好者，都能在这里找到属于自己的交流小世界。


在这里你可以获得什么
- [维扣原型](https://modao.cc/proto/TyzvXils5n5ou2EsZJL0y/sharing?view_mode=device&screen=skaq6903TtBu1pIiDaez7l&canvasId=sskaq690TtBu1pJioveDem)
- 作品分享: 展示你的精彩照片，收获点赞、评论和关注。
- 热门作品推荐: 发现更多优秀摄影师和精彩照片。
- 赛事制度：摄影挑战与活动，激发创作灵感，赢取丰厚奖品.(当然了要等到有钱的时候！)

> 摄影圈子，与志同道合的人共同成长,我们不歧视任何使用小灵通拍照的手机用户.

## 项目时间线

- `2024 年 10 月 20 日` 目前问题 
1. 个人的技术水平终究有限。在开发这个充满创意的摄影分享APP的征程上，虽然凭借着对Go语言的学习积累，能够较为顺利地进行后端接口的开发，但是面对安卓的开发，却感到力不从心。所以真的很期待着这位`大神`的出现。
2. 目前，本人依旧深陷于各种复杂的考试学习当中，生活被繁重的学业任务所占据。尽管心中对这`耳语`的项目充满了热爱与执着，但无奈分身乏术。
3. 最后我想说一句，它一定会被开发出来的!!!
<!-- node 2023 年 10 月 20 日 确定项目技术栈-->
由于那段时间一直沉浸在对Go语言的学习当中，索性想用Go来开发一个APP的后端接口使用，所以便采用了土拨鼠。后来因为某些原因学习到至今，项目进度极其缓慢。

- `2023 年 8 月 17 日` 项目命名
当机立断想到了开发一个分享每个人摄影内容的APP，它不仅仅是一个APP，更是一个充满温暖和希望的图库。每个人的摄影作品都将被珍视和欣赏，每一个故事都将被倾听和铭记。
项目准备起名为`Wecho`耳语，寓意聆听每一个人的声音，所以谐音起名叫“维扣”。
- `2023 年 8 月 16 日` 想法来源
偶然一次出门旅游，怀揣着对未知风景的期待与憧憬，踏上陌生的土地。阳光洒在肩头，每一处景色都仿佛在诉说着故事。我停下脚步，举起相机，准备记录下这美好的瞬间时，透过那小小的取景框，却意外地看见了少年时候的自己。所以我们的一切都值得被保存。




## 项目缓存规范
- RedisKey的规范
```shell
project:module:business:uk
项目名    模块名   业务名  唯一标识
```

### 缓存信息

- 这部分还没设计完成,等待完善吧。

| Key                                | 类型   | 过期时间 | 说明              |
| ---------------------------------- | ------ | -------- | ----------------- |
| wecho:user:access_token:{username} | string | 2天      | 存储用户生成的JWT |
| wecho:userinfo:cache:{username}       | SET    | 3天      | 用户信息详情缓存  |
| wecho:user:login_fail:{username}   | Incr   | 30Min    | 错误登录次数      |


## Minio启动命令
```bash
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  --name minio1 \
  -v ./data:/data \
  -v ./certs:/tmp/certs \
  -e "MINIO_ROOT_USER=xxx" \
  -e "MINIO_ROOT_PASSWORD=xxx" \
  -e "MINIO_SERVER_URL=xxx" \
  quay.io/minio/minio server /data  --console-address ":9001" --certs-dir /tmp/certs
```

## 后端服务编译
```bash
# Windows编译Linux
# 请在CMD中执行命令
set GOARCH=amd64
set GOOS=linux
go build main.go

# Mac编译Linux
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build main.go
```

## 接口统计(大类)
- [ ] 用户服务设计
- [ ] 登录服务设计
- [ ] 画板服务设计
- [ ] 审核服务设计
- [ ] 私信服务设计