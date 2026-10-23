# DSH 插件如何生效：社区实践研究

> 研究时间：2026-10-23
> 方法：读社区模板与成熟插件源码 + npm 元数据 + 本机实测（mathlab 隔离 profile）
> 目的：搞清「一个插件从被安装到真正出现在模型/界面里」的完整链路，并对照本项目找差距。

---

## 1. 生效链路（五步）

```
① 安装：dsh plugin --profile <name> add <包名|github:owner/repo|本地目录>
        → pnpm 装进 profile，写入 profile package.json 的 dependencies
        → 插件清单里的 dsh.bundle.patch 触发「bundle 注册」
        → profile 的 dsh.profile.bundles 增加该包

② 组合：宿主读 profile → 每个 bundle 的 cordis.patch.yml
        → insert 一行 { id, name: <包名> }
        → Cordis 按包名解析 exports["."] 得到 Host 模块

③ 挂载：Host 模块导出 name / inject / apply
        → Cordis 依赖注入就绪后调用 apply(ctx, config?)
        → apply 里注册工具、服务、HTTP 路由、钩子

④ 客户端：package.json 的 dsh.client（platform=web + inject 列表）
        → Web 宿主把 <包名>/client 注入 boot 清单
        → 浏览器用 window.__ModuleLoader__.load({ id, factory }) 加载

⑤ 呈现：客户端 ctx.slots.inject / register 占槽位
        → 侧栏入口 sidebar.panellist、页面 main、设置页 settings.section…
```

**证据**（本机）：`dsh --profile mathlab --dump-config` 输出
`# == dsh-math-calculator` + `- id: math-calc`，且 boot 页面里出现
`dsh-math-calculator/client.js`。

---

## 2. 三个社区样本

### 2.1 最小模板：bugmaker2/dsh-plugin-template（102★）

`package.json`：

```json
{
  "main": "lib/index.js",
  "exports": { ".": "./lib/index.js", "./client": "./lib/client.js", "./cordis.patch.yml": "./cordis.patch.yml" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-primitives"] }
  },
  "files": ["lib", "cordis.patch.yml", "dsh.plugin.json", "README.md"],
  "engines": { "dsh": ">=0.1.0-rc.6", "node": "^22.19 || >=24" },
  "peerDependencies": { "@deepseek-ai/cordis": "*", "@deepseek-ai/dsh-client-runtime": "*", "react": "^18.2.0" }
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: dsh-plugin-template
      name: dsh-plugin-template
      # config: 可选，覆盖 Config schema 的默认值
```

`src/index.ts`（Host）：

```ts
export const name = 'dsh-plugin-template'   // 必须等于包名
export const inject = ['typert']
export interface Config { greeting: string; excited: boolean }
export const Config = z.object({ greeting: z.string().default('Hello'), excited: z.boolean().default(false) })
export function apply(ctx: Context, config?: Config): void {
  const resolved = Config(config ?? {})
  new GreetRuntime(ctx, resolved)
  ctx.effect(() => ctx.typert.register(TYPERT_MANIFEST), '...')   // 可释放注册
}
```

`src/client/index.tsx`（Client）：

```ts
export const inject = ['slots', 'remote', 'locale']
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), '...')
  ctx.slots.inject('conversation.view', () => ctx.slots.register({ name: 'conversation.view', id, order: 20, label, inject }, View))
}
```

### 2.2 双端模板：omdsh-dev/plugin-template

- `dsh.manifestVersion: 1` + `icon` + `locale/*.json` 导出（给市场展示用）；
- `engines.dsh: ">=0.2.1-rc.2 <0.3.0"`；
- `files` 只放 lib/补丁/本地化/图标/README，**源码不进包**；
- build 用 tsdown（bundler），而不是裸 tsc。

### 2.3 成熟插件：dshmarket（8421★）/ dsh-permission-rules

- 都用 `engines.dsh`，peerDependencies 精确到 rc；
- client inject 按需：market 用 locale/settings/theme；permission 用 connection/web/locale/settings；
- 都带 `prepack: build + preflight`，并有独立 `manifestVersion`；
- 复杂插件会拆 `./typert`、`./update-api-v1` 等子导出。

---

## 3. 与本项目对照

| 项 | 社区做法 | 本项目 | 结论 |
|---|---|---|---|
| bundle 补丁 | `dsh.bundle.patch` → insert 行 | 相同 | ✅ 一致 |
| Host 入口 | name/inject/apply | 相同 | ✅ |
| 配置 | schemastery Config + patch.yml 覆盖 | 无 Config，走 HTTP 设置 | ✅ 合理（配置项少） |
| Client 加载 | `__ModuleLoader__` + slots | 相同（手写 loader，不依赖 client-runtime 封装） | ✅ 可用；社区封装更省样板 |
| 兼容声明 | `engines.dsh` | `dsh.engines.dsh`（非标准位置） | ⚠️ 对齐（保留兼容） |
| 注册清单 | `dsh.plugin.json` + manifestVersion | 无 | ⚠️ 补（市场识别用） |
| 图标/本地化 | icon + locale 子导出 | 无 | ➖ 可选（中文单语项目） |
| 构建 | esbuild/tsdown 打包 | tsc 直出 | ✅ 本项目无需打包 |
| 安装构建 | `prepare`（GitHub 安装需 allowBuilds） | 无 prepare | ✅ 更安全 |
| 可释放注册 | `ctx.effect` 包裹 | 部分有 | ✅ |
| 依赖 | peerDependencies 精确区间 | cordis ^4.0.1 / tools >=0.1.0<0.3.0 | ✅ |
| 测试/CI | vitest + CI | 自研 runner + preflight | ✅ |

---

## 4. 关键教训

1. **`name` 必须三处一致**：package.json、cordis.patch.yml 的 name、Host 导出的 name。
   id 只是 profile 内局部标识，可不同。
2. **`dsh.bundle.patch` 是安装生效的开关**：没有它，pnpm 装了也不会进 profile bundles。
3. **客户端靠 `dsh.client`**：platform=web + inject 列表；缺 inject 会在浏览器里拿到 undefined 服务。
4. **注册要可释放**：`ctx.effect(fn, label)`，否则热重载/HMR 会重复注册。
5. **GitHub 安装会跑 `prepare`**：pnpm≥10 需要 `allowBuilds` 白名单；本地目录安装不会跑，所以必须先 build。
6. **peerDependencies 不要写成 `*`**：社区成熟插件都用 `rc` 区间，避免跨大版本误装。
7. **`engines.dsh` 是标准位置**；写在 `dsh.engines` 大概率无人读取（本项目已对齐）。
8. **注册清单 `dsh.plugin.json`** 只服务市场/目录，不影响宿主加载；但加上更规范。

---

## 5. 对项目的改动（低风险）

- `package.json`：`engines` 增加 `dsh` 字段（保留原 `dsh.engines` 兼容），`dsh.manifestVersion: 1`；
- 新增 `dsh.plugin.json`（id/version/main/engines/contributes），并加入 `files`；
- `scripts/preflight.mjs` 增加清单一致性检查（id=包名、version 一致）。

---

## 6. 来源

- https://github.com/bugmaker2/dsh-plugin-template
- https://github.com/omdsh-dev/plugin-template
- https://github.com/dsh-market/dsh-market （npm: dshmarket）
- https://github.com/PerryLink/dsh-permission-rules
- https://registry.npmjs.org/ （各包 latest 元数据）
- 本机：`dsh --profile mathlab --dump-config`、boot 页面、隔离实例 API
