# 团队协作流程（Git / GitHub）

仓库：<https://github.com/YufuChen0718/gundam-hangar>

## 第一次设置（每个人）

1. 仓库主人在 GitHub → Settings → Collaborators 里邀请另外三位，被邀请的人去邮箱接受邀请。
2. 本地 clone：
   ```bash
   git clone git@github.com:YufuChen0718/gundam-hangar.git
   cd gundam-hangar
   npm install        # after T01 is done
   npm run dev        # open the http://localhost:5173 shown in the terminal
   ```
3. 确认 git 用的是**你自己的** GitHub 身份（课程按提交记录核对个人贡献）：
   ```bash
   git config user.name    # 你的名字
   git config user.email   # 你 GitHub 账号绑定的邮箱
   ```

## 每天的流程

```bash
git switch main
git pull                          # 1. 开工前先同步
git switch -c anim/swing-poses    # 2. 新开一个分支：<领域>/<内容>
# ... 写代码，npm run dev 自测 ...
npm run build                     # 3. 推之前确认能编译
git add -A
git commit -m "anim: refine sword swing key poses"
git push -u origin anim/swing-poses
```
4. 在 GitHub 上开 Pull Request → 另一位队友看一眼 → Merge 到 `main`。
5. After T10 is done, every update to `main` automatically deploys the website and demo.

## Handing a task to dsh / Antigravity

- Run it on your own branch: `git switch -c <area>/<task-id>`
- Prompt: read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/tasks/Txx-*.md`, then complete only this task
- Before committing, read through the diff yourself and check off the acceptance criteria; commit and open the PR **with your own account** (the course checks contributions against commit history)

**规则：**
- `main` 必须随时能跑。坏掉的代码留在分支里。
- 小步提交、经常合并（每 1–2 天），不要攒一周再合并。
- 分支前缀：`asset/`、`anim/`、`equip/`、`ui/`、`xr/`、`web/`、`fix/`
- commit message 前缀同上，例如 `ui: add region color pickers`。
- 改了别人负责的目录，在 PR 里 @ 一下对方。
- 大文件：单个模型尽量 < 20 MB；`.blend` 源文件放 `assets-src/`（超过 50 MB 先在群里商量，必要时用 Git LFS）。

## 文件放哪

| 内容 | 位置 |
|---|---|
| 网页用的模型/贴图（GLB、PNG） | `public/assets/models/`、`public/assets/textures/` |
| Blender 源文件 | `assets-src/` |
| 代码 | `src/`（结构见 README） |
| 项目网页（proposal / milestone / final） | `website/` |
| 计划、进度、实验记录 | `docs/` |
| 实验数据（CSV、截图） | `docs/results/` |

## 遇到冲突

```bash
git switch main && git pull
git switch your-branch
git merge main          # 解决冲突 → git add → git commit
```
解决不了就在群里说，不要强推（`git push --force`）到 `main`。
