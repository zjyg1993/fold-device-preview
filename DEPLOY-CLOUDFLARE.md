# 轻量本地运行与 Git 自动部署

本地无需安装任何 npm 依赖；Cloudflare 构建环境按需下载发布工具。两边共用 `public/` 中的界面、动效与代理运行时，以及 `lib/preview-proxy.mjs` 中的 HTML、CSS 和地址重写逻辑。本地服务入口为 `server.mjs`，云端入口为 `worker.mjs`。

代理默认开启，默认域名为 `h5.maycur.com`。

## 本地使用

需要 Node.js 18 或更新版本。无需 `npm install`、`npm ci` 或 `node_modules`：

```sh
npm run dev
```

打开 http://localhost:9218 。`npm start` 也可前台运行；`./start.sh` 后台运行、`./stop.sh` 停止、`./restart.sh` 手动重启。原有 Node.js 20 可直接运行，无需切换版本。

如果之前的服务仍在运行，请自行停止后重新启动以加载后端修改。前端修改刷新页面即可。

## 一次性设置 Git 自动部署

1. 将完整项目提交并推送到 Git 仓库，包含 `worker.mjs`、`server.mjs`、`wrangler.jsonc`、`lib/`、`public/`、`package.json`、`package-lock.json` 和 `.node-version`。不要提交 `node_modules/`、`.wrangler/`、`.run/`、密钥或 `.env`。
2. 在 Cloudflare 打开现有 Worker **fold-device-preview → Settings → Build**，连接该仓库，选择实际使用的生产分支。
3. 设置下面的构建配置并保存，触发首次部署。

| 配置 | 值 |
| --- | --- |
| Worker 名称 | `fold-device-preview`，与 `wrangler.jsonc` 一致 |
| 项目根目录 | 包含 `wrangler.jsonc` 的目录；文件就在仓库根目录时使用根目录 |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| 构建环境变量 | `NODE_VERSION=24` |

保留平台默认的 npm 安装步骤；项目没有第三方依赖，锁文件也不含 Wrangler 依赖树。`npm run build` 运行语法检查，`npm run deploy` 通过 npx 按固定版本下载 Wrangler 4.160.0，并打包发布 Worker 和静态资源。工具使用云端构建缓存，本机不需要安装。

绑定仓库属于 Cloudflare 账户设置，提交源码不会自动创建绑定。若已绑定，只需核对上方配置。推送到选定生产分支后，在构建日志中确认部署成功。

## 以后只需本地预览并推送

- 本地：`npm run dev`，修改后验证页面。
- 线上：按平时方式提交代码并推送生产分支，Cloudflare 自动发布；无需本地运行部署命令或登录 Wrangler。

更新现有账户下的同名 Worker，可继续使用原 `workers.dev` 地址；以平台实际部署输出为准。

## 可选：手动发布或 Workers 本地模拟

这两项会将 Wrangler 下载到 npm 工具缓存，需要 Node.js 22.12 或更新版本。本机已有兼容 Homebrew Node，可仅对这次命令指定路径：

```sh
env PATH="/opt/homebrew/bin:$PATH" npm run login
env PATH="/opt/homebrew/bin:$PATH" npm run deploy
```

`npm run dev:worker` 可显式启动 Workers 本地模拟，`npm run check:worker` 可验证实际打包。它们会按需下载工具，日常轻量本地开发和 Git 发布流程不需要运行。

## 发布验证

- `/healthz` 返回 `{"status":"ok"}`。
- 首页代理按钮默认选中，网址默认填写 `h5.maycur.com`。
- 输入 `https://example.com` 并打开，应显示 Example Domain；`/__proxy/aHR0cHM6Ly9leGFtcGxlLmNvbQ/` 应返回目标页面。
- 检查目标网站，以及内外屏、横竖屏、主题、刷新、新窗口打开和保留区域。

## 实现与限制

- `assets.run_worker_first: true` 使代理、健康检查和根路径跳转恢复先经过 Worker，其他文件由 `ASSETS` 提供，未匹配路径返回 404。
- `proxy-runtime.js` 按原始文本打包，保留动态资源、fetch、XHR、表单和快照功能。
- 代理不转发或安装目标网站 Cookie；线上预览通过不含 `allow-same-origin` 的 iframe 沙箱隔离模拟器。
- 云端代理不能访问你电脑或家庭局域网中的服务。登录、验证码、WebSocket、Service Worker、原域名与存储依赖仍有原有兼容性限制；目标站点可能限制 Cloudflare 出口访问。
- 代理页面和资源请求使用 Workers 配额，实际可用性受平台及目标站点限制。

官方说明：[Git 构建配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[Workers 静态资源与绑定](https://developers.cloudflare.com/workers/static-assets/binding/)。
