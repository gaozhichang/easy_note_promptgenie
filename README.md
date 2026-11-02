# Easy Note（快捷记事本）

一个面向 macOS 的轻量本地 Markdown 记事本。所有笔记都是普通的 `.md` 文件：第一行是标题，其余是正文，不依赖数据库，也不上传云端。

- 仓库地址：<https://github.com/gaozhichang/easy_note_promptgenie>
- 本项目由 [PromptGenie](https://github.com/ChrisZou/promptgenie) 改造而来

## 功能

- 左侧笔记列表，按文件修改时间倒序排列
- 选中笔记后直接在右侧编辑，停止输入 0.5 秒自动保存
- 正文第一行就是标题，保存时文件名自动跟随标题；重名时自动追加序号
- 内置 Markdown 工具栏：标题、加粗、斜体、删除线、列表、引用、代码、链接
- 支持源码 / 分屏 / 预览三种模式，默认分屏边写边渲染
- 预览支持 GFM 表格、任务列表和删除线；可随时查看源码，并一键复制完整 Markdown
- 支持选择图片或直接从剪贴板粘贴图片，图片自动复制到笔记目录的 `images/` 子目录
- 笔记仍然是普通 `.md` 文件，可以随时用其他编辑器打开
- 保存目录可自定义，默认是 `~/快捷记事本`
- 菜单栏常驻图标，点击直接显示并聚焦主窗口
- 全局快捷键 `⌘⇧Space`，一键显示 / 隐藏主窗口
- 关闭窗口只会隐藏到菜单栏，不会退出应用；点击托盘图标或 Dock 图标即可恢复
- 支持搜索、删除确认、在访达中显示当前笔记
- 纯本地文件存储，没有数据库、账号或网络请求

## 使用

| 快捷键 | 功能 |
| --- | --- |
| `⌘⇧Space` | 显示 / 隐藏主窗口（窗口在前台时再按一次隐藏） |
| `⌘N` | 新建笔记 |
| `⌘S` | 立即保存 |
| `⌘F` | 搜索笔记 |
| `⌘R` | 重新读取保存目录 |
| `⌘B` | 加粗选中文字 |
| `⌘I` | 斜体选中文字 |
| `⌘K` | 插入链接 |
| `⌘Q` | 退出应用（退出前会保存当前笔记） |

关闭窗口后应用会隐藏到菜单栏。再次点击菜单栏图标、点击 Dock 图标，或按 `⌘⇧Space`，都可以回到主窗口；窗口已在前台时按 `⌘⇧Space` 会隐藏。

## Markdown 与图片

正文区域支持直接输入 Markdown 语法，也可以使用正文上方的工具栏：

- 一级/二级标题、加粗、斜体、删除线
- 无序列表、有序列表、引用、行内代码
- 链接：`[链接文字](https://)`
- 图片：选择本地图片，或直接在编辑器中粘贴剪贴板图片

编辑器右上角可以在「源码 / 分屏 / 预览」之间切换：

- 源码：纯文本 Markdown 编辑器，带格式工具栏
- 分屏（默认）：左侧写 Markdown，右侧实时渲染，适合边写边看效果
- 预览：只阅读渲染后的 Markdown，支持 GFM 表格、任务列表、删除线和代码块
- 复制源码：一键复制包含标题在内的完整 Markdown 文件内容，方便粘贴到其他编辑器

插入或粘贴图片时，图片会被复制到当前笔记目录的 `images/` 子目录，不会写入应用内部数据库。笔记中的路径是相对路径，因此整个笔记目录可以直接拷贝或备份。

删除笔记时不会自动删除 `images/` 中被引用的图片，避免误删其他笔记共用的图片；需要时可以在访达中手动清理。

## 从源码运行

环境要求：

- macOS 11 及以上
- Node.js 18 及以上
- pnpm
- Rust stable
- Xcode Command Line Tools

```bash
git clone https://github.com/gaozhichang/easy_note_promptgenie.git
cd easy_note_promptgenie
pnpm install
pnpm tauri dev
```

## 构建

```bash
pnpm tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`：

- `macos/快捷记事本.app`
- `dmg/快捷记事本_0.1.0_aarch64.dmg`（Apple Silicon；Intel Mac 为 `x64`）

将 `.app` 拖入「应用程序」即可使用。当前构建使用 ad-hoc 签名，首次打开如被 Gatekeeper 拦截，可在「系统设置 → 隐私与安全性」中允许。

## 数据存储

每篇笔记都是一个独立的 Markdown 文件：

```text
第一行是标题

后面的内容都是正文。
```

- 默认目录：`~/快捷记事本`
- 图片目录：`~/快捷记事本/images/`
- 自定义目录：在应用左下角「保存位置」中修改，图片会跟随保存到该目录下的 `images/`
- 设置文件：`~/Library/Application Support/com.gaozhichang.quicknote/settings.json`
- 文件名由标题生成，会过滤 `/ \ : * ? " < > |` 等非法字符，最长 60 个字符
- 列表顺序来自文件修改时间；用其他编辑器修改文件后，点刷新即可重新读取
- 删除笔记会直接删除磁盘文件，操作前会二次确认

## 技术栈

- [Tauri 2](https://tauri.app/)（Rust + WKWebView）
- React 18 + TypeScript + Vite
- TailwindCSS
- lucide-react
- Markdown 渲染：[react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm)（均为 MIT）
- 排版：[Tailwind Typography](https://github.com/tailwindlabs/tailwindcss-typography)（MIT）

## 项目结构

```text
src/                     React 界面
  components/            侧边栏、编辑器、Markdown 预览、设置、确认框
  services/notes.ts      笔记相关的 Tauri invoke 封装
  App.tsx                选中、自动保存、快捷键、窗口事件
src-tauri/
  src/lib.rs             笔记文件读写、图片、设置、托盘与退出流程
  Info.plist             macOS 文件夹访问说明
  icons/                 应用图标
```

## 开发检查

```bash
pnpm build
cd src-tauri && cargo test
```

## 已知限制

- 目前主要在 macOS 上验证，Windows / Linux 仅保留了基础路径处理
- 预览不渲染原始 HTML，仅渲染标准 Markdown / GFM
- 不支持拖拽图片、富文本编辑和云同步
- 插入的图片会复制到 `images/`，删除笔记时不会自动清理
- 删除操作不可撤销，请留意确认提示

## 开源协议

本项目基于 [PromptGenie](https://github.com/ChrisZou/promptgenie)（MIT License）改造，原项目版权归 ChrisZou 所有。

本项目同样以 MIT License 发布，详见 [LICENSE](LICENSE)。
