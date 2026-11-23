# Obsidian 笔记

独立第三方插件，非 Obsidian 官方出品、与 Obsidian 无关联或背书关系。图标中的紫色晶体为 Obsidian 商标图形，仅作**指示性使用**以表明本插件作用/兼容于 Obsidian；右下角黑底白色环线为 Paseo 平台标识（菜单内为矢量近似，插件列表图标为官方标识 raster），仅表明运行平台。叠加 Paseo 标识不构成商标免责；若商标权人提出异议应停止使用该图形。

在 Paseo 里指定一个 Obsidian vault，然后**只读**浏览其中的 markdown 笔记。vault 在哪台机器上，就在哪台机器的 paseo daemon 上安装本插件；屏幕顶部的主机切换器决定当前读哪台机器，每台机器各自保存自己的 vault 路径。适合笔记分散在本机与多台服务器、不想为每个 vault 建工作区也不想登机器翻文件的场景。编辑请回 Obsidian 本体或其官方 CLI（Obsidian 1.12+）进行，本插件不写盘。

需要 Paseo 0.16.0 或更新：按设备记忆浏览状态用的 device 级设置、以及图片的二进制 RPC 都自 0.16 起提供；其余 API 更早版本已有，但这两项决定了下限。

## 设置

在 Settings → Plugins → Obsidian 笔记，或屏幕内 Vault 栏的「设置」按钮中配置：

- **Vault 路径**：手工添加绝对路径，支持 `~/` 开头，最多 20 条。服务器上没有装 Obsidian 时，用这里填同步过去的 markdown 目录。
- **自动发现**：读本机 Obsidian 注册表（macOS 为 `~/Library/Application Support/obsidian/obsidian.json`，Linux 为 `$XDG_CONFIG_HOME/obsidian/obsidian.json` 或 `~/.config/obsidian/obsidian.json`，Windows 为 `%APPDATA%/obsidian/obsidian.json`），自动列出 Obsidian 记录过的 vault。探测失败或没装 Obsidian 时为空，不报错。

路径不存在或不是目录时，该 vault 在列表中灰显并给出原因，不影响其他 vault。设置按主机保存，互不串。

## 能力

- Vault 列表；笔记按目录树浏览（Obsidian 式纯行 + 每层缩进引导线，可折叠、带各目录笔记计数、按名字排序），或切到「最近」按修改时间倒序平铺。
- 全局模糊搜索：「本库 / 全部」切换，全部 = 当前主机所有已配置 vault。文件名支持跳字模糊（子串命中优先排前），正文按空格拆词后全部命中（顺序无关），命中带上下文片段与 vault 标签，点击直接跳到对应库的笔记。支持 `#tag` / `tag:xx` 过滤（frontmatter tags 与 inline #tag，纯数字不算 tag），可与词组合；web 端搜索框支持上下键选命中、Enter 打开。
- 链出笔记面板：解析 `[[笔记]]`（含别名与 `#标题` 锚点）与相对 md 链接，列出可跳转目标；配合前进/后退历史栈（会话内，不持久化）。正文内点击跳转受 host 限制不可行，故以面板承载。
- 大纲与文内查找：按 ATX 标题切段渲染，大纲面板点击跳段（图片加载改变段高后自动校正）；文内查找给匹配计数与上/下一个循环跳段。
- 外部改动感知：阅读态每 10s 轮询笔记 mtime，被外部修改时出横幅（刷新/忽略），被删除时出横幅并可返回列表；列表每 15s 轮询。
- Markdown 阅读使用 Paseo 自带的渲染：标题、表格、代码块、任务清单、链接。
- 笔记里的截图与图片内联显示，覆盖标准 `![](path)` 与 Obsidian 的 `![[图片.png]]` 嵌入语法；空格路径经尖括号 `!<...>`/百分号编码/embed 覆盖（markdown 规范不允许裸空格链接目标）；裸文件名会在全 vault 范围内解析；代码区内的图片语法不会被改写。
- 复制笔记绝对路径（便于把路径交给 agent 让它自己读）、手动刷新。
- 按设备记住浏览状态：上次的 vault、打开到的笔记、vault 栏与目录栏收合、各 vault 的目录展开形态、两列宽度；重进屏幕或重启 app 后恢复（收起了就一直收起，不自动展开）。
- 宽屏两列（vault / 目录）可拖拽调宽（vault 140–400px、目录 220–560px）；拖拽为 web 端 pointer 事件，native 宽屏（平板）不支持调宽。
- 宽屏三栏（vault / 列表 / 阅读），窄屏与移动端单列逐级返回。

## 数据访问与权限

纯只读插件：只使用 `readdir`、`stat`、`realpath`、`readFile` 四个读 API（`server/vault.ts`、`server/search.ts`），不写任何文件，也不修改 Obsidian 的任何配置。

只允许读已配置 vault 内的路径：vault 必须是设置中列出的成员，相对路径先经 schema 校验（拒绝绝对路径、`..`、反斜杠），再用 realpath 收敛后做根目录前缀比对，拦截 symlink 逃逸与目录穿越。遍历跳过点开头条目（`.obsidian`、`.git`、`.trash`、iCloud 占位文件）与 symlink。

搜索与浏览共用 30 秒的目录列表缓存，避免每次按键重扫全 vault；正文扫描 16 并发、单篇超 2MB 跳过、结果上限 100 条。

本地 vault 的图片字节通过插件的二进制 RPC 从 daemon 传到客户端，在客户端转成 data URL 内联进 markdown，这部分不经过任何第三方服务。插件自身代码不发任何网络请求、没有 telemetry、不处理凭据。渲染由 Paseo 的 Markdown 组件完成：打开含远程 `http(s)` 图片的笔记时，Paseo 客户端会在渲染时请求这些图片 URL，即联系远程图片主机；不含远程图片的笔记只与本地 daemon 通信。

- 目录树使用全量笔记路径构建（不受「最近」视图的 1000 条上限影响）；「最近」视图按 mtime 取前 1000 条并标注截断。
- Command Center（⌘K）提供「打开 Obsidian 笔记」全局入口。

## 已知限制

- 只读，不能编辑或保存；写操作请在 Obsidian 本体或官方 CLI 进行。
- 正文内链接点击不可拦截（host Markdown 无拦截 prop、无 workspace 上下文时相对链接被忽略），跳转走「链出笔记」面板；wikilink 在正文中仍显示为文本。
- 文内查找为跳段定位 + 计数，不做渲染层高亮；不支持 setext 标题（===/---）；跨段引用式链接 `[t][ref]` 与脚注不保证渲染。
- 外部改动感知为轮询：笔记 ≤10s、列表 ≤15s、目录/裸名索引缓存 ≤30s；外部只改图片文件（笔记 mtime 不变）感知不到。
- 不解析 `[[笔记]]` 的双链跳转以外的图谱关系；图片嵌入 `![[图片.png]]` 会正常渲染。
- 全局搜索范围为当前主机的已配置 vault，不跨主机（插件 RPC 只作用于所选主机）。
- 单篇笔记正文上限 2MB；单张图片上限 8MB，每篇最多内联 40 张图；超出部分显示占位说明而不是静默丢弃。
- SVG 图片只在桌面与 web 端显示，Paseo 在 iOS/Android 端会剥离 SVG。
- 横向滚动与拖拽调宽仅 web 端；native（含宽屏平板）名单行截断显示省略号、无横滚，列宽固定。
- 不监听文件变化，笔记更新后用「刷新」按钮重读。
- 远程机器需要各自安装本插件并在该机器的 Settings → Plugins 打开插件总开关；daemon 版本需满足 manifest 的 requirements。