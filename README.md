# 19991100 Physics Lab

一个轻量的物理可视化门户，使用原生 HTML、CSS、JavaScript 和 Canvas 构建。没有前端框架、运行时依赖或构建工具链，适合持续增加独立的物理实验页面。

## 本地开发

需要 Node.js 20 或更高版本。

```bash
npm run dev
```

打开 `http://127.0.0.1:4173`。

## 生产构建

```bash
npm run build
npm run preview
```

构建只把静态文件复制到 `dist/`，不进行打包、转译或依赖下载。

## 结构

```text
.
├── index.html              # 门户页面
├── assets/
│   ├── styles.css          # 视觉系统、布局和响应式样式
│   ├── main.js             # 导航、主题和 Canvas 交互
│   ├── conveyor.js         # 水平传送带模型的模拟与渲染
│   ├── conveyor.css        # 传送带实验页样式
│   └── home.css            # 首页专属样式
│   └── og-cover.svg        # 社交分享封面
├── labs/conveyor-belt/     # 水平传送带独立实验页
├── server.mjs              # 零依赖本地服务器
├── scripts/build.mjs       # 零依赖静态构建
└── .github/workflows/      # GitHub Pages 自动部署
```

后续增加实验时，推荐新建 `labs/<slug>/index.html` 与对应脚本，并从门户卡片链接到该路径。每个实验可以保持完全独立，不需要修改全局架构。

## GitHub Pages 与域名

仓库包含 `CNAME`，目标域名是 `19991100.xyz`。首次推送后，在 GitHub 仓库的 **Settings → Pages** 中把发布来源设为 **GitHub Actions**，再运行或等待 `Deploy to GitHub Pages` 工作流。

域名 DNS 需要指向 GitHub Pages：

- 根域名 `19991100.xyz`：配置 GitHub Pages 提供的四个 `A` 记录，或按 GitHub 当前文档配置 `ALIAS/ANAME`。
- `www.19991100.xyz`：配置 `CNAME` 指向 GitHub Pages 默认域名。
- 在 GitHub Pages 设置中确认自定义域名为 `19991100.xyz`，并开启 HTTPS。

DNS 与 HTTPS 证书签发不由仓库代码自动完成。
