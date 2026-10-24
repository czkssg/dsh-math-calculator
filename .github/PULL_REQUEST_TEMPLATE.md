## 这次改动做了什么

<!-- 一句话说清目的，不要只说"修了个 bug" -->

## 关联 issue

<!-- 例如 Closes #12 -->

## 自检（全绿才能提）

- [ ] `npm run build` 通过
- [ ] `npm run test:all` 全绿（新增测试**已加进** `run-all-tests.mjs` 基线表）
- [ ] `npm run preflight` 全 ✓
- [ ] `npm run doccheck` 0 缺失
- [ ] 若改了公式库：已重跑 `node test/formulas-list.mjs` 并更新 `formulas-all` 基线
- [ ] 若改了 operation 契约：已同步 schema enum / `opHelp` / 集成测试断言

## 影响面

- [ ] 只影响本插件（未改宿主原生行为、未注入全局样式）
- [ ] 未与其它插件抢占槽位/路由/工具名（新命名带包名前缀）
- [ ] 计算路径保持确定性（无 `Math.random`）

## 备注

<!-- 踩到的坑、需要的后续工作 -->
