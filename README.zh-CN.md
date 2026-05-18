# skills-migrator

将项目或全局环境中已有的 AI agent skills 迁移到统一的 canonical 目录，并通过 symlink 或 copy 的方式安装到多个 agent 平台。

[English README](README.md)

## 功能概览

`skills-migrator` 解决的问题是：不同 agent 平台各自有自己的 skills 目录，维护多份数据容易冲突和漂移。本工具会先把已有 skills 迁移到统一目录：

```text
.agents/skills
```

然后再把需要支持的 agent 平台链接到这份 canonical 数据源。

当前支持的平台：

- Codex
- Claude Code
- OpenCode
- Cursor
- Kiro
- Windsurf
- Trae
- Qoder
- Antigravity

## 目录约定

项目内 canonical 目录：

```text
.agents/skills
```

全局 canonical 目录：

```text
~/.agents/skills
```

支持的 agent id：

```text
codex
claude-code
opencode
cursor
kiro
windsurf
trae
qoder
antigravity
```

## 使用方式

交互式迁移当前项目：

```bash
npx skills-migrator migrate
```

当没有传 `--agent` 时，CLI 会先检测项目中已有的 agent 配置目录，并在目标平台选择器中默认勾选这些平台。之后你可以继续选择其它要扩展安装的目标平台。

迁移前预览，不写入文件：

```bash
npx skills-migrator migrate --dry-run
```

只处理某个平台：

```bash
npx skills-migrator migrate --agent claude-code --dry-run
```

全局迁移预览：

```bash
npx skills-migrator migrate --global --dry-run
```

非交互执行：

```bash
npx skills-migrator migrate --yes
```

## 连接方式

应用迁移计划前，CLI 会让你选择连接方式：

- `Symlink, fallback to copy`：推荐。优先创建 symlink，失败后 copy，并在终端输出 warning。
- `Symlink only`：只允许 symlink，失败则报错。
- `Copy`：直接复制 canonical skill 到目标平台目录。

symlink 实现遵循 Vercel Labs skills 的文件系统 symlink 思路：

- 使用相对路径 symlink。
- 计算相对路径时处理父级 symlink。
- 已经指向同一 realpath 时视为已连接。
- 替换错误的旧 symlink 或普通目录。
- Windows 使用 junction。

## 迁移流程

项目模式下，流程是：

1. 扫描项目中已有的 agent 配置目录，例如 `.claude`、`.cursor`、`.kiro`、`.windsurf`、`.trae`、`.qoder`、`.gemini/antigravity`。
2. 扫描这些平台已有的 skills。
3. 将已有 skills 迁移到 `.agents/skills`。
4. 进入扩展阶段，选择要安装到哪些 agent 平台。
5. 根据选择的连接方式创建 symlink 或 copy。

工具只识别 skills 目录下一层目录，并要求目录内存在：

```text
SKILL.md
```

例如：

```text
.claude/skills/foo/SKILL.md
.agents/skills/bar/SKILL.md
```

## 安全策略

- 同名但内容不同的 skill 会被标记为 conflict。
- 交互模式下 conflict 默认跳过。
- `--yes` 模式下 conflict 会自动跳过并在结果中报告。
- 成功迁移后，原始 source skill 会移动到：

```text
.agents/.tmp/backups/<timestamp>/<agent>/<skill>
```

这样原 agent 目录里不会残留 `.backup-*`。

如果连接创建失败，工具会尽量恢复原始 source 目录。

## 本地调试

在仓库内构建：

```bash
npm run build
```

使用本地 CLI：

```bash
node bin/cli.mjs migrate --dry-run
node bin/cli.mjs migrate --agent qoder --dry-run
```

确认 symlink：

```bash
ls -l .claude/skills
readlink .claude/skills/<skill-name>
```

如果 Git 中看到 symlink 文件内容类似：

```text
../../.agents/skills/<skill-name>
```

这是正确的，表示该 skill 目录是 symlink，真实内容在 `.agents/skills/<skill-name>`。

## 开发文档

项目架构、扩展新 agent 的 checklist、测试分布和发布前检查见：

[docs/development-manual.md](docs/development-manual.md)
