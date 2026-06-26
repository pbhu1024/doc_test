# 配置说明

Auto Research 使用 YAML 配置文件管理所有设置。

---

## 初始化配置

安装完成后，运行初始化命令：

```bash
auto-research init
```

这会在 `~/.auto-research/config.yaml` 生成默认配置文件。

你也可以指定自定义路径：

```bash
auto-research init --config ./my-project/config.yaml
```

---

## 完整配置项

```yaml
# ===== 搜索配置 =====
search:
  max_sources: 10         # 最大并发数据源数
  timeout: 30s            # 单源超时时间
  retry: 3                # 失败重试次数
  strategy: breadth       # 搜索策略: breadth / depth / hybrid
  language: zh            # 默认搜索语言

# ===== 数据源配置 =====
sources:
  arxiv:
    enabled: true
    max_results: 20
  semantic_scholar:
    enabled: true
    api_key: ""           # 可选，提升速率限制
  news:
    enabled: false        # 新闻源默认关闭
  github:
    enabled: false
    token: ""             # GitHub Personal Access Token

# ===== 分析配置 =====
analyze:
  default_method: cluster   # cluster / summarize / sentiment
  depth: 2                  # 分析深度 (1-5)
  llm:                      # LLM 辅助分析（可选）
    provider: openai
    model: gpt-4o
    api_key: ${OPENAI_API_KEY}  # 支持环境变量

# ===== 输出配置 =====
output:
  format: markdown          # markdown / pdf / html / json
  path: ./output            # 输出目录
  template: null            # 自定义 Jinja2 模板路径
  include_sources: true     # 是否包含来源列表

# ===== 缓存配置 =====
cache:
  enabled: true
  strategy: lru             # lru / ttl / hybrid
  max_size: 100MB           # 最大缓存大小
  ttl: 3600                 # TTL 秒数

# ===== 日志配置 =====
logging:
  level: info               # debug / info / warning / error
  file: null                # 日志文件路径，null=仅控制台
  format: text              # text / json
```

---

## 环境变量

配置中可以使用 `${ENV_VAR}` 语法引用环境变量：

```yaml
sources:
  github:
    token: ${GITHUB_TOKEN}

analyze:
  llm:
    api_key: ${OPENAI_API_KEY}
```

---

## 配置优先级

配置加载顺序（后者覆盖前者）：

1. 默认配置（内置于代码中）
2. 全局配置文件 `~/.auto-research/config.yaml`
3. 项目级配置文件 `./.auto-research.yaml`
4. 命令行参数 `--config / -c`
5. 环境变量 `AR_*`

### 示例

```bash
# 命令行覆盖 output.path
auto-research run "AI trends" --config ./custom.yaml -o ./results
```
