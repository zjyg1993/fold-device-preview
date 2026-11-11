# 发布到 Render

本项目需要 Node.js 后端代理，应创建 **Web Service**，不能创建 Static Site。部署配置见 `render.yaml`，Node.js 主版本固定为 24；没有第三方 npm 依赖，构建阶段只运行语法检查。

## 首次发布（没有仓库）

1. 在 GitHub 新建一个空仓库，例如 `folden-device`，公开或私有均可。
2. 解压部署包，将其中的项目文件上传到仓库根目录。确保根目录直接包含 `package.json`、`server.mjs`、`render.yaml`、`.node-version` 和 `public/`，不要额外嵌套一层文件夹。若使用网页上传，请确认隐藏文件 `.node-version` 也已上传。
3. 登录 https://dashboard.render.com ，选择 **New → Blueprint**，连接 GitHub 并选择该仓库；私有仓库需要授权 Render 读取。
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

保留 Render 自动提供的 `PORT`，无需设置为 9218，也不要使用 `start.sh` 或 `restart.sh`；这些脚本只用于本机后台运行。

## 发布后验证

- 访问 `/healthz`，应返回 `{"status":"ok"}`。
- 打开首页，输入 `https://example.com`，保持“代理”开启，检查网页是否显示。
- 切换内外屏、横竖屏，并确认预览请求使用当前 `onrender.com` 域名，不请求访问者的 `127.0.0.1`。

云端代理只能访问 Render 服务器能连接的网站，无法连接你电脑上的 `localhost:3000` 或仅在你局域网可达的地址。HTTPS 页面直接嵌入 HTTP 网站可能被浏览器阻止，这类网址请使用代理模式。依赖登录、验证码、存储或强反代理检查的网站仍有预览限制。

Free 实例空闲时可能休眠，再次访问需要等待唤醒。后续更新仓库后，可在 Render 查看自动部署状态或手动触发部署。

官方文档：https://render.com/docs/web-services 、https://render.com/docs/blueprint-spec 、https://render.com/docs/free 。
