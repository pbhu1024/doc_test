# CLI 命令参考

Auto Research 提供功能完整的命令行工具。

---

## 全局参数

| 参数 | 简写 | 说明 |
|------|------|------|
| `--verbose` | `-v` | 输出详细日志 |
| `--config` | `-c` | 指定配置文件路径 |
| `--quiet` | `-q` | 静默模式，只输出结果 |
| `--help` | `-h` | 显示帮助信息 |
| `--version` | | 显示版本号 |

---

## run — 执行研究

```bash
auto-research run <query> [options]
```

| 参数 | 说明 |
|------|------|
| `<query>` | 搜索查询（必填） |
| `--sources` / `-s` | 指定数据源，逗号分隔 |
| `--max-results` / `-n` | 每源最大结果数（默认 10） |
| `--output` / `-o` | 输出路径 |
| `--format` / `-f` | 输出格式：markdown/pdf/html/json |
| `--language` / `-l` | 搜索语言（默认 zh） |
| `--template` / `-t` | 自定义 Jinja2 模板 |

### 示例

```bash
# 基本搜索
auto-research run "AI ethics"

# 指定数据源和结果数
auto-research run "climate change" -s arxiv,semantic_scholar -n 20

# 指定输出格式和路径
auto-research run "量子计算" -f pdf -o ./reports/qc_report.pdf

# 英文搜索，静默模式
auto-research run "transformer architecture" -l en -q
```

---

## init — 初始化配置

```bash
auto-research init [options]
```

| 参数 | 说明 |
|------|------|
| `--config` / `-c` | 自定义配置路径 |
| `--force` | 覆盖已有配置 |

### 示例

```bash
# 使用默认路径
auto-research init

# 指定路径
auto-research init --config ./project/.auto-research.yaml

# 覆盖已有配置
auto-research init --force
```

---

## sources — 管理数据源

### sources list

列出所有可用数据源及其状态：

```bash
auto-research sources list
```

输出示例：

```
NAME              STATUS    RATE LIMIT
arxiv             enabled   10/s
semantic_scholar  enabled   5/s
web_search        enabled   20/s
news              disabled  —
github            disabled  —
```

### sources test

测试特定数据源连接：

```bash
auto-research sources test <name>
```

输出示例：

```
Testing arxiv... ✅ OK (latency: 320ms)
```

### sources add

添加自定义数据源配置：

```bash
auto-research sources add my_api \
  --type api \
  --endpoint https://api.example.com/search \
  --api-key $MY_API_KEY
```

---

## cache — 缓存管理

```bash
# 查看缓存状态
auto-research cache status

# 清除所有缓存
auto-research cache clear

# 清除特定数据源缓存
auto-research cache clear --source arxiv
```

---

## config — 查看配置

```bash
# 查看当前生效的配置
auto-research config show

# 查看特定配置项
auto-research config show search.timeout

# 查看配置加载路径
auto-research config paths
```
