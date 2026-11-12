# 架构与开发维护

本文描述仓库实现；部署账户绑定、线上域名及运行状态需在相应平台核对。

## 模块职责

| 文件 / 目录 | 职责 |
| --- | --- |
| `server.mjs` | Node HTTP 服务：静态文件、健康检查、代理请求与根相对路径恢复 |
| `worker.mjs` | Workers fetch 入口：代理、健康检查与 `ASSETS` 分发 |
| `lib/preview-proxy.mjs` | 共用的 URL 编解码、HTML/CSS 重写和错误页 |
| `public/index.html`、`public/style.css` | 模拟器结构、工具栏与外观 |
| `public/app.js` | 输入校验、状态、布局尺寸、偏好保存与预览消息处理 |
| `public/preview-origin.js` | 代理来源、预期消息来源与 iframe 沙箱配置 |
| `public/motion.js` | 真实网页旋转重排、内外屏连续视口过渡与状态保留 |
| `public/proxy-runtime.js` | 注入目标 HTML 的函数：动态请求、导航、路由修复和快照响应 |
| `public/vendor/`、`public/assets/` | 本地渲染/快照模块与边框，出处见 `vendor/NOTICE.md` |
| `public/demo.html` | 随设备视口变化的同源示例 |
| `start.sh`、`stop.sh`、`restart.sh` | 本机后台生命周期，运行信息保存在 `.run/` |
| `wrangler.jsonc`、`render.yaml` | Workers 与 Render 部署配置 |

前端直接以 ES Modules 加载，无框架或前端构建过程。`npm run build` 只做语法检查；Workers 发布时才由 Wrangler 打包 Worker 并上传静态资源。Node 不依赖 Wrangler。

## 请求链路

| 路径 | 行为 |
| --- | --- |
| `/`、`/simulator` | 模拟器首页；HTTP 回环 `127.0.0.1` 首页会跳转到 `localhost` |
| `/healthz` | GET 返回 `{"status":"ok"}`，HEAD 返回响应头；不探测上游网站 |
| `/__proxy/<token>/<path>?<query>` | 目标 origin 使用无填充 Base64URL 编码为 token |
| `/app.js`、`/vendor/…` 等 | Node 读取 `public/`；Worker 交给 `ASSETS` |

例如 `https://example.com/path?q=1` 对应 `/__proxy/aHR0cHM6Ly9leGFtcGxlLmNvbQ/path?q=1`。片段保留在浏览器 URL，不发送给服务端。

1. `app.js` 校验输入，只接受不含用户名/密码的 HTTP/HTTPS URL。关闭代理或预览同源示例时，iframe 直接加载原网址。
2. 代理请求发送到 `preview-origin.js` 选定的来源。服务端解码目标 origin，拒绝非法地址及自身代理循环。
3. Node/Worker 使用 fetch 访问上游，手动处理重定向。转发选定的内容类型、范围与缓存验证等请求头；Referer 及写请求的 Origin 按目标来源设置，不携带浏览器 Cookie/Authorization。
4. HTML/CSS 按声明编码解码并输出 UTF-8。HTML 重写资源、链接、表单和 base，移除部分安全属性及嵌入限制 meta，并注入运行时。其他类型保持流式响应。上游 Set-Cookie 和原站安全响应头不会直接安装到模拟器来源。
5. 运行时适配 fetch、XHR、常见 DOM URL 属性、表单及 history，并通过消息同步输入框。目标脚本未整体重写，动态 import、任意脚本导航等行为不保证兼容。
6. 脚本跳到未代理的根相对地址时，入口尝试从同源代理 Referer 恢复目标路径；文档请求以 307 恢复代理 URL，其他资源直接代理。该机制依赖浏览器确实发送 Referer。

代理支持 GET、HEAD、POST、PUT、PATCH、DELETE、OPTIONS，普通静态资源只支持 GET/HEAD。上游请求设置 25 秒中止计时；代理异常一般返回 502 错误页。浏览器 12 秒加载提示不会中止请求。代理响应使用 `Cache-Control: no-store`。

## 来源与消息隔离

| 模拟器访问地址 | 代理来源 | 代理 iframe |
| --- | --- | --- |
| `http://localhost:<port>` | `http://127.0.0.1:<port>` | 保留 `allow-same-origin`，通过不同主机名隔离外壳 |
| HTTPS、局域网 IP、云端域名等其他地址 | 当前页面 origin | 移除 `allow-same-origin`，使用不透明来源 |

同源示例与直接加载页面保留 `allow-same-origin`。外壳检查 message 的来源窗口及预期 origin：本机代理为回环 origin，不透明沙箱为字符串 `null`。注入脚本检查父窗口及外壳 origin。

`folden:proxy-ready`、`folden:proxy-error` 报告加载/导航。设备动效直接调整同一个 iframe 的视口：横竖屏旋转为 520ms，内外屏铰链折叠为 900ms。过渡不读取目标 DOM、不等待截图、不替换或隐藏 iframe，也不修改 iframe 的 src，因此跨来源或未完成加载的页面同样可持续显示。内外屏切换时 WebGL 只渲染铰链和边框，`getLiveSurface()` 将同一着色器曲面投影为带圆角的 CSS 裁切轮廓，真实 iframe 在轮廓内持续显示。WebGL 不可用时才回退为实时视口动画，边框副本在过渡后移除。目标站点可能自行响应 resize、媒体查询和滚动范围变化。

`folden:capture`、`folden:captured` 的旧快照响应与 vendor 模块暂予保留以兼容已有调用，但当前设备切换不再使用截图贴图。光学 WebGL 渲染器只用于原始铰链与边框，真实页面留在 DOM 中。

不同目标站点共享代理来源，原站跨域关系不能保留。不透明沙箱还可能限制站点存储；这些隔离措施不等于完整浏览器兼容层。

## 配置与状态

| 配置 | 作用 |
| --- | --- |
| `HOST` | Node 监听地址，默认 `127.0.0.1`，局域网/Render 使用 `0.0.0.0` |
| `PORT` | Node 监听端口，默认 `9218`；Render 使用平台注入值 |
| `.node-version` | Node 版本选择，当前 `24` |
| `wrangler.jsonc` 的 `dev` | Workers 本地模拟 `127.0.0.1:9218`，与 Node 默认端口互斥 |
| `wrangler.jsonc` 的 `name` | 发布目标 Worker 名称 `fold-device-preview` |

Node 不自动读取 `.env`；Workers 配置和绑定由 Wrangler/平台管理。`NODE_ENV` 在 Render 中设为 production，当前代码没有据此切换业务逻辑。

浏览器只在 localStorage 的 `folden-preferences` 保存 mode、theme、safe；网址和代理开关只在当前页面内存中。无数据库或服务端会话。`.run/`、`.wrangler/`、`dist/`、`node_modules/` 和本地环境文件均已加入 Git 忽略规则。

## 修改与验证

- 界面、尺寸与偏好：`app.js`、`style.css`、`index.html`。
- 来源隔离：同步核对 `preview-origin.js`、两个入口的 shell origin 及消息验证。
- 代理：公共重写在 `lib/preview-proxy.mjs`；网络传输分别在 Node/Worker 入口，需同时核对；动态适配在 `proxy-runtime.js`。
- 动效：`motion.js`，保留 iframe 实例和可见性、旋转与展开过程中的真实视口重排、动画异常时的清理。

`proxy-runtime.js` 是可独立注入的函数文本。Node 按请求读取；Worker 通过 Wrangler `Text` 规则导入原始文本，避免打包器引入外部辅助变量。不要随意改成依赖模块导入的普通脚本。

基础检查运行 `npm run check`，不验证网站兼容性或实际部署。`npm run check:worker` 执行 Worker 干运行打包，按需下载 Wrangler，输出 `dist/worker/`，不会部署。

手动验证 `/healthz`、同源 demo、外部代理页面、直接加载、四种姿态、主题、保留区域、清空和刷新。涉及导航时检查输入框同步；涉及动效时检查旋转中的网页重排和折叠后恢复。Node 验证不能替代 Worker 验证。

前端和 Node 按请求读取的运行时修改后刷新即可；Node 入口/共享服务模块修改后请手动重启。Worker 中所有修改均需重新发布。

## 常见问题

| 现象 | 检查方向 |
| --- | --- |
| 首页空态、输入框有默认网址 | 正常初始状态，提交网址后才加载 |
| `EADDRINUSE` | Node 与 Worker 模拟默认共用 9218，检查已有服务或选择其他端口 |
| 后台启动失败 | 查看 `.run/server.log`；启动锁需确认没有启动操作后再处理 `.run/start.lock` |
| 代理 502 / 超时 | 检查目标地址、服务所在地网络和 TLS；健康检查正常不代表目标可达 |
| 直接加载空白 | 检查嵌入策略及 HTTPS 嵌入 HTTP 的限制，尝试代理或新窗口 |
| 云端无法打开 localhost | localhost 指向云端执行环境，本机开发服务需用本地 Node 预览 |
| 登录/验证失败 | 不代理 Cookie/Authorization，还可能受沙箱、原域名或站点策略限制 |
| Node 后端修改未生效 | 请手动重启，前台无 watch，后台脚本不自动重启 |

部署步骤见 [Cloudflare](../DEPLOY-CLOUDFLARE.md) 与 [Render](../DEPLOY-RENDER.md)，使用范围见 [README](../README.md#代理与预览边界)。
