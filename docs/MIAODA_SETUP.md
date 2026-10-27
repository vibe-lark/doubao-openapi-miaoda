# 接入自己的妙搭应用

本仓库是一份不含线上应用绑定的源码快照。先初始化自己的 full_stack 应用，再导入业务代码；不要把作者演示应用的 ID 当成自己的应用 ID。

## 1. 初始化目标应用

准备 Bun、Node.js 和已授权的 lark-cli。创建或选择自己有开发权限的妙搭 full_stack 应用，例如：

```bash
lark-cli apps +create --name '豆包 Open API Demo' --app-type full_stack --as user
# 将下方 app_your_app_id 替换为刚返回的真实妙搭 app_id。
lark-cli apps +init --app-id app_your_app_id --dir ../my-doubao-app --as user
```

在 GitHub 源码目录执行：

```bash
bun run install:demo ../my-doubao-app
```

导入脚本只接受独立 Git 仓库内、无未提交修改、尚未接入业务模块的妙搭模板。它复制本示例的 client/server/shared/tests/docs/scripts 和构建配置，保留目标 `.spark`、`.env*`、平台指南、Git 历史及远端。若目标已有业务，请手动合并，不能覆盖已有模块。

目标应用里继续开发时，以目标 `.agents/skills` 的平台指南为准。本仓库的 schema 是初始表结构快照；表结构变更通过平台完成后重新生成，不能手工维护自动生成文件。

## 2. 准备自己的飞书应用

妙搭 `app_...` 与飞书开放平台 `cli_...` 是不同 ID。豆包 OAuth 使用有相应豆包权限的飞书应用；妙搭平台用户用来隔离该用户保存的凭据。

本示例使用的 scope：

```text
offline_access contact:user.base:readonly
doubao:session:read doubao:session:write
doubao:session.event:write doubao:session.message:read
```

在自己的应用后台核验接口资格与真实权限，发布权限配置，并让用户授权。客户应用不会因为复制源码而自动获得豆包接口权限。

在飞书应用后台登记自己的 HTTPS 回调：

```text
https://你的妙搭运行域名/app/你的妙搭app_id/oauth/callback
```

运行域名以自己的妙搭应用实际返回地址为准，不要猜测租户域名。首次发布后核对真实 online_url，更新回调及服务端配置。

## 3. 初始化业务表

在导入后的目标应用目录，对自己的开发库执行 [001-doubao-account.sql](001-doubao-account.sql)。该文件包含凭据表、审计字段及 RLS 初始化；先确认目标库是新应用且同名表尚不存在。按平台要求预览 SQL，再执行，不能在服务启动时运行 DDL。

```bash
lark-cli apps +db-execute --app-id app_your_app_id --environment dev \
  --file docs/001-doubao-account.sql --dry-run --as user
# 核对新应用开发库和 SQL 后执行
lark-cli apps +db-execute --app-id app_your_app_id --environment dev \
  --file docs/001-doubao-account.sql --yes --as user
bun run gen:db-schema
```

`+db-execute` 参数和危险操作确认以当前 CLI 与平台返回为准；没有 dev 环境时先确认应用数据库环境设置，不要误操作其他应用的 online 库。生成 schema 后重新检查 `doubao_account` 字段，保留平台生成的审计列与类型。

## 4. 设置服务端环境变量

参考根目录 [.env.example](../.env.example)，在目标应用的 dev/online 环境分别设置：

| Key | 内容 |
| --- | --- |
| DOUBAO_APP_ID | 自己的飞书 `cli_...` 应用 ID |
| DOUBAO_APP_SECRET | 对应密钥，仅服务端保存 |
| DOUBAO_SCOPES | 实际获批且使用的 scope，空格分隔 |
| DOUBAO_REDIRECT_URI | 已登记的自己的 OAuth 回调 |
| DOUBAO_TOKEN_KEY | 32 字节随机密钥的 Base64 |
| LOG_REQUEST_BODY / LOG_RESPONSE_BODY | 均设置为 false，避免记录敏感请求与响应 |

不要覆盖 CLI 拉取的 `.env.local`，不要将凭据提交 GitHub。dev/online 分别安全管理密钥；密钥丢失后原有凭据无法解密。授权 code/state 使用专用请求头，但仍应检查自己的网关与日志系统，不记录这些请求头和用户令牌。

## 5. 开发、验证和发布

在目标妙搭应用目录执行：

```bash
bun install
bun run dev:local
```

打开启动输出的完整路径（包含 `/app/<app_id>/`）。平台身份必须通过受支持的开发入口注入，不能直接访问 NestJS 端口后手工伪造用户字段。

验证自己的 OAuth 回调、扫码确认、会话创建、文本生成、刷新和退出；再执行：

```bash
bun run type:check
bun test tests
bun run eslint
bun run build:prod
git add client server shared tests docs scripts package.json bun.lock
git commit -m '接入豆包用户授权与会话对话示例'
git push origin sprint/default
lark-cli apps +release-create --app-id app_your_app_id --branch sprint/default \
  --apply-reason '发布豆包Open API示例，提供用户授权与会话对话' --as user
```

提交前还需检查根目录构建配置的修改并一并提交；只发布已提交并推送的版本。跟踪同一 release_id 至 `finished`，确认 commit_id 匹配本次提交。`pending` 或明确的 PENDING 节点交给平台配置的审批负责人处理；不要通过另建发布或自动审批绕过。

GitHub 仓库用于源码分发；妙搭工作仓库的 `sprint/default` 用于平台发布。不要将自己的 `.spark`、凭据、日志或完整妙搭仓库历史推回公开源码仓库。对外分享运行链接前，按需要配置应用可见范围；代码公开不等于应用已向所有人开放。
