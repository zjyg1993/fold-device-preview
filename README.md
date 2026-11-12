# Folden Device

折叠屏网页预览工具，支持四种内外屏姿态、网址代理、立体折叠与横竖屏旋转。前端为原生 HTML、CSS 和 ES Modules；本地与 Render 使用 Node.js，Cloudflare 使用 Workers，两种入口共用前端资源和代理重写模块。

## 本地运行

Node.js 入口要求 **18 或更新版本**（`package.json`），`.node-version` 固定为 **24**，新环境建议使用 24。项目没有第三方 npm 运行依赖，无需先执行 `npm install`。

```sh
npm run dev
```

打开 [http://localhost:9218](http://localhost:9218)。`npm start` 与上述命令相同，均为前台运行，没有自动监听重启。

| 操作 | 命令 | 说明 |
| --- | --- | --- |
| 后台启动 | `./start.sh` | 日志 `.run/server.log`，PID `.run/server.pid` |
| 停止后台服务 | `./stop.sh` | 仅管理 `start.sh` 记录的进程 |
| 手动重启后台服务 | `./restart.sh` | 先停止再启动；前台进程由所在终端管理 |
| 语法检查 | `npm run check` | 检查入口、共享模块及主要浏览器脚本 |
| 构建检查 | `npm run build` | 等同于语法检查，不生成前端产物 |

前端文件修改后刷新浏览器即可；修改 `server.mjs` 或 `lib/preview-proxy.mjs` 后，请手动重启 Node 服务。

服务默认 `HOST=127.0.0.1`、`PORT=9218`。开放局域网监听可在启动时传入环境变量：

```sh
HOST=0.0.0.0 PORT=9218 npm run dev
```

其他设备访问 `http://<运行服务的电脑IP>:9218`。项目不自动读取 `.env`。HTTPS 反向代理应保留外部 `Host`，并传递 `X-Forwarded-Proto: https`。

## 使用

首次进入为内屏横向、浅色主题，代理默认开启，输入框预填 `h5.maycur.com`，**点击“打开”或回车后才加载网页**。

- 支持 HTTP/HTTPS 地址；普通域名默认补 HTTPS，`localhost:3000`、常见本机和局域网地址默认补 HTTP。其他地址可显式填写协议。
- 关闭“代理”可直接嵌入自己的开发页面；直接嵌入受目标网站嵌入策略和浏览器混合内容限制。
- 在当前模拟器地址后加 `/demo.html` 可预览本地示例，例如 `http://localhost:9218/demo.html`；该同源示例始终直接加载。
- 工具栏提供主题、刷新、四种姿态、新窗口打开和摄像头/折叠保留区域提示。“新窗口打开”使用目标原始网址。
- “×”清空预览。刷新整个模拟器会回到空态并重新预填默认域名；只保存姿态、主题和保留区域偏好，不保存目标网址及代理开关。

| 姿态 | 网页 CSS 视口 |
| --- | --- |
| 内屏横向 | 880 × 624 |
| 内屏纵向 | 624 × 880 |
| 外屏纵向 | 432 × 624 |
| 外屏横向 | 624 × 432 |

设备按可用窗口空间缩小，稳定姿态下 iframe 保持表中视口尺寸。横竖屏切换以 520ms 动画连续调整真实网页视口并反向旋转内容；内外屏切换保留 900ms WebGL 铰链折叠：边框使用原始折叠模型，真实 iframe 根据同一模型投影得到的屏幕轮廓连续裁切。同一个 iframe 全程显示，不截图、不显示白底网址占位、不重新设置页面地址；WebGL 不可用时使用实时视口过渡。两类动画均尊重系统“减少动态效果”设置。

## 架构与部署

| 运行场景 | 入口 / 配置 | 静态资源 | 运行或发布方式 |
| --- | --- | --- | --- |
| 本地 Node | `server.mjs` | 直接读取 `public/` | `npm run dev` 或后台脚本 |
| Cloudflare Workers | `worker.mjs` / `wrangler.jsonc` | `ASSETS` 绑定到 `public/` | Git 自动构建，或手动 Wrangler 发布 |
| Render Web Service | `server.mjs` / `render.yaml` | 直接读取 `public/` | 仓库部署，前台执行 `npm start` |

两个入口都提供 `/healthz`、`/__proxy/…` 和模拟器页面（`/`、`/simulator`）。HTML/CSS 重写在 `lib/preview-proxy.mjs`，浏览器动态请求与导航适配在 `public/proxy-runtime.js`。项目没有数据库、登录会话或持久化后端存储。

- [架构、代理链路与开发维护](docs/ARCHITECTURE.md)
- [Cloudflare Git 自动部署与手动发布](DEPLOY-CLOUDFLARE.md)
- [Render Node 服务部署](DEPLOY-RENDER.md)

Cloudflare 日常流程是本地 Node 预览、提交并推送已绑定的生产分支。仓库本身不能确认账户是否已绑定或线上是否已部署，以平台设置和部署日志为准。Wrangler 固定为 `4.160.0`，仅在执行对应 npm 命令时由 `npx` 按需下载。

## 代理与预览边界

代理重写 HTML、CSS、资源、链接、常见 fetch/XHR 与表单请求，并处理重定向、部分前端路由和百度搜索框导航。HTTP `localhost` 页面使用 `127.0.0.1` 作为代理来源；其他访问地址使用当前来源和不含 `allow-same-origin` 的 iframe 沙箱，详见[来源与消息隔离](docs/ARCHITECTURE.md#来源与消息隔离)。

代理不转发浏览器 Cookie、Authorization，也不向浏览器安装目标站 Set-Cookie。依赖登录、验证码、原始域名、浏览器存储、Service Worker、WebSocket 或强反代理检查的站点可能无法完整运行。不同远程来源映射到同一个代理来源，不能用于验证真实跨域策略。

代理从**服务运行位置**连接目标：本地 Node 可访问本机开发服务；云端部署无法访问你电脑上的 localhost 或家庭局域网。局域网使用时，目标中的 localhost 仍指运行 Node 的电脑。

这里模拟 CSS 视口，不模拟移动 UA、触摸硬件、浏览器内核或原生折叠屏 API；深色按钮只改变模拟器外壳。代理保持 TLS 证书校验，但预览响应会调整原站嵌入策略。当前服务无鉴权、目标白名单或应用级限流，对外开放范围应按实际用途配置。

设备边框、光学渲染与快照模块改编自 DuoSimulator，来源和保留的许可证见 [public/vendor/NOTICE.md](public/vendor/NOTICE.md)。
