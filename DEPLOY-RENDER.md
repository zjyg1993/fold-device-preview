# Render Web Service 部署

本项目需要 Node.js 后端代理，应创建 **Web Service**，不能创建 Static Site。部署配置见 `render.yaml`，Node.js 主版本固定为 24；没有第三方 npm 依赖，构建阶段只运行语法检查。

此方式使用 `server.mjs` 和 `public/`，不运行 `worker.mjs` 或 Wrangler。Cloudflare 发布方式见 [Cloudflare 部署说明](DEPLOY-CLOUDFLARE.md)，共用模块及维护方法见 [架构文档](docs/ARCHITECTURE.md)。

## 首次发布

1. 使用已有项目仓库；尚无仓库时，在 GitHub 新建仓库并提交完整项目。
2. 确保仓库根目录包含 `package.json`、`package-lock.json`、`server.mjs`、`lib/`、`public/`、`render.yaml` 和 `.node-version`。`npm run check` 还检查 Worker 及共享前端文件，因此应提交完整项目，不要仅上传 Node 入口。不要提交 `.run/`、`node_modules/` 或本地环境文件。
3. 登录 [Render 控制台](https://dashboard.render.com)，选择 **New → Blueprint**，连接 GitHub 并选择该仓库；私有仓库需要授权 Render 读取。
4. 确认识别到 `folden-device` Web Service 和 Free 实例，然后创建。配置文件已包含构建命令、启动命令、健康检查和环境变量。
5. 部署成功后，打开 Render 提供的 `https://…onrender.com` 地址。该地址无需添加 `:9218`。

如果使用 **New → Web Service** 手动创建，填写：

| 配置 | 值 |
| --- | --- |
| Runtime | Node |
| Build Command | `npm run check` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/healthz` |
| Environment | `HOST=0.0.0.0`、`NODE_ENV=production` |

Node 24 由仓库 `.node-version` 指定。`NODE_ENV=production` 是部署标记，当前代码不据此切换业务逻辑。

保留 Render 自动提供的 `PORT`，无需设置为 9218，也不要使用 `start.sh` 或 `restart.sh`；这些脚本只用于本机后台运行。

## 发布后验证

- 访问 `/healthz`，应返回 `{"status":"ok"}`。
- 首页与 `/simulator` 可访问；网址预填 `h5.maycur.com` 但不自动加载。输入 `https://example.com` 并提交，保持“代理”开启，检查网页是否显示。
- 输入当前站点的 `/demo.html` 完整网址，检查同源示例。
- 切换内外屏、横竖屏，并确认预览请求使用当前 `onrender.com` 域名，不请求访问者的 `127.0.0.1`。

云端代理只能访问 Render 服务器能连接的网站，无法连接你电脑上的 `localhost:3000` 或仅在你局域网可达的地址。HTTPS 页面直接嵌入 HTTP 网站可能被浏览器阻止，这类网址请使用代理模式。依赖登录、验证码、存储或强反代理检查的网站仍有预览限制。

Free 实例空闲时可能休眠，再次访问需要等待唤醒。后续提交并推送绑定分支后，在 Render 确认自动部署是否启用及部署是否成功，或手动触发部署。前后端修改均需重新部署；本机后台脚本不会影响 Render。健康检查只验证服务响应，不验证目标网站可达性。

官方文档：[Web Services](https://render.com/docs/web-services)、[Blueprint 配置](https://render.com/docs/blueprint-spec)、[Free 实例限制](https://render.com/docs/free)。
