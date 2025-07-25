---
title: 利用CloudFlare来实现镜像加速
tags:
  - docker
categories:
  - docker
publishDate: 2024-07-16 00:00:00
description: 利用CloudFlare来实现镜像加速
slug: "tech/docker/cloudflare-proxy"

---


## 目前可用加速镜像仓库

DockerProxy 代理加速：`dockerproxy.com`

百度云 Mirror: `mirror.baidubce.com`

Daocloud: `docker.m.daocloud.io`

南京大学：`docker.nju.edu.cn`

上海交大：`docker.mirrors.sjtug.sjtu.edu.cn`

```json
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-EOF
{
    "registry-mirrors": [
        "https://<changme>.mirror.aliyuncs.com",
        "https://dockerproxy.com",
        "https://mirror.baidubce.com",
        "https://docker.m.daocloud.io",
        "https://docker.nju.edu.cn",
        "https://docker.mirrors.sjtug.sjtu.edu.cn"
    ]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

## 准备工作

1. 注册[CloudFlare](https://www.cloudflare.com/zh-cn/)账号

## 开始自建CloudFlare仓库

1. 首先进入`cloudflare`创建一个[Workers](https://dash.cloudflare.com/c579b91fceeb4c0fd92690ee27753575/workers-and-pages/create/integration/678adf9e-89f8-4235-9530-d95a12851369/version/0.0.3/integrations-setup),创建完成以后点击[编辑代码](https://dash.cloudflare.com/c579b91fceeb4c0fd92690ee27753575/workers/services/edit/broken-wildflower-64b4/production)

2. 编辑`Woker.js`文件
```js
import HTML from './docker.html';
export default {
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;
        const originalHost = request.headers.get("host");
        const registryHost = "registry-1.docker.io";
        if (path.startsWith("/v2/")) {
        const headers = new Headers(request.headers);
        headers.set("host", registryHost);
        const registryUrl = `https://${registryHost}${path}`;
        const registryRequest = new Request(registryUrl, {
            method: request.method,
            headers: headers,
            body: request.body,
            // redirect: "manual",
            redirect: "follow",
        });
        const registryResponse = await fetch(registryRequest);
        console.log(registryResponse.status);
        const responseHeaders = new Headers(registryResponse.headers);
        responseHeaders.set("access-control-allow-origin", originalHost);
        responseHeaders.set("access-control-allow-headers", "Authorization");
        return new Response(registryResponse.body, {
            status: registryResponse.status,
            statusText: registryResponse.statusText,
            headers: responseHeaders,
        });
        } else {
        return new Response(HTML.replace(/{{host}}/g, originalHost), {
            status: 200,
            headers: {
            "content-type": "text/html"
            }
        });
        }
    }
}
```
3. 编辑器内新建`docker.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>镜像使用说明</title>
    <style>
        body {
            font-family: 'Roboto', sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
        }
        .header {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: #fff;
            padding: 20px 0;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .container {
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            background-color: #fff;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            border-radius: 10px;
        }
        .content {
            margin-bottom: 20px;
        }
        .footer {
            text-align: center;
            padding: 20px 0;
            background-color: #333;
            color: #fff;
        }
        pre {
            background-color: #272822;
            color: #f8f8f2;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
        }
        code {
            font-family: 'Source Code Pro', monospace;
        }
        a {
            color: #4CAF50;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        @media (max-width: 600px) {
            .container {
                margin: 20px;
                padding: 15px;
            }
            .header {
                padding: 15px 0;
            }
        }
    </style>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Source+Code+Pro:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
    <div class="header">
        <h1>镜像仓库Hub加速说明</h1>
    </div>
    <div class="container">
        <div class="content">
            <p>为了加速镜像拉取，你可以使用以下命令设置 registry mirror:</p>
            <pre><code>sudo tee /etc/docker/daemon.json &lt;&lt;EOF
{
    "registry-mirrors": ["https://{{host}}"]
}
EOF</code></pre>
            <p>为了避免 Worker 用量耗尽，你可以手动 pull 镜像然后 re-tag 之后 push 至本地镜像仓库:</p>
            <pre><code>docker pull {{host}}/library/alpine:latest # 拉取 library 镜像
docker pull {{host}}/coredns/coredns:latest # 拉取 coredns 镜像</code></pre>
        </div>
    </div>
    <div class="footer">
        <p>Powered by Cloudflare Workers</p>
        <p><a href="https://blog.mletter.cn" target="_blank">技术支持: Cloudflare && 春日心动日记</a></p>
    </div>
</body>
</html>
```

4. 点击右侧的部署

![](https://img10.360buyimg.com/ddimg/jfs/t1/233201/20/20655/112966/66960dbeF94b73bb3/5187c6eda27a9525.jpg)