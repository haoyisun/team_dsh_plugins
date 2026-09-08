# ADR-012：安全导入 DSH Profile MCP YAML

## 状态

Accepted

## 日期

2026-09-08

## 背景

部分 MCP Server 文档提供的不是 `mcpServers` JSON，而是 DSH Profile patch：
根节点为 `insert`，其中以 `@deepseek-ai/dsh-mcp-client` 条目的 `config` 保存
启动配置。要求用户手动剥离 YAML 包装层会增加路径转义和字段复制错误。

导入器不能把任意 Profile 插件条目当作 MCP Server，也不能执行或保留 Profile
注册语义；MCP Manager 仍只拥有 Settings 中的 MCP 实例。

## 决策

- JSON/JSONC 解析失败后，使用 `yaml` 的受限解析模式尝试 YAML；继续执行输入
  大小、实例数量、未知字段、凭据和路径安全检查。
- YAML alias 数量限制为零，并拒绝重复键，避免别名扩展和字段覆盖。
- Profile patch 接受直接包含 `insert` 的对象，或由此类 patch 对象组成的根数组；
  `insert` 必须是数组，且只提取 `name: '@deepseek-ai/dsh-mcp-client'` 条目的
  `config`。
- 非 MCP 条目产生忽略提示；完全没有 MCP 条目时拒绝导入。未知的条目包装字段
  形成阻塞提示，不猜测其运行语义。
- `id` 仅作为导入来源名称，实例的 `serverName`、transport、command、args、
  env 和 headers 仍走既有规范化与安全分类。导入结果始终先保存为禁用。

## 备选方案

- **要求用户只粘贴 `config`**：实现简单，但保留了最容易出错的手工转换步骤。
- **接受任意 YAML Profile 并应用 patch**：越过 MCP Manager 的所有权边界，
  可能修改无关插件，不可接受。
- **自行实现 YAML 子集**：依赖更少，但引号、注释和转义语义容易与标准 YAML
  不一致，长期维护风险更高。

## 结果

MCP Manager 新增 `yaml` 运行依赖。Reference、README 和导入测试必须明确
支持的 Profile 包装形态；解析报告不得包含配置中的凭据值。
