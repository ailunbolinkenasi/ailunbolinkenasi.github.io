# 维扣图元-专属你的拍照摄影社区


## 简单功能
- 是男人，就来分享你拍的照片！！！

## RESTFul API 

> 一会儿再说。
## 基本的后端技术栈
- Gorm: 数据库工具
- Gin: 速度极快的Go语言Web框架
- Minio: 分布式存储
## 项目目录

> 一会儿再说

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
## 常用代码片段
1. 实现结构体
```go
// UserDataService 用户管理服务
var UserDataService = newUserDataService()

func newUserDataService() *userDataService {
	return &userDataService{}
}

type userDataService struct {
}
```

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

## 接口统计
### 用户服务(普通用户)
- [x] 获取用户详情信息
- [x] 修改个人资料信息
- [x] 修改个人密码
- [x] 修改头像信息
- [ ] 绑定手机信息
- [ ] 绑定身份信息
- [ ] 关注用户

### 画板服务
- [x] 获取画板详情信息
- [x] 创建画板
- [ ] 更新画板
- [x] 删除画板
- [ ] 获取画板列表信息
- [ ] 收藏画板
- [ ] 根据画板标签分类画板信息

## 审核服务
- [ ] 审核画板
- [ ] 审核画板图片

### 通信服务
- [ ] 发送私信
