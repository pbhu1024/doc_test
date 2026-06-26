# 快速开始

本指南将帮助你快速上手 Auto Research。

## 环境要求

| 依赖 | 最低版本 |
|------|----------|
| Python | 3.10+ |
| Node.js | 18.x |
| Git | 2.30+ |

## 安装

### 方式一：使用 pip 安装

```bash
pip install auto-research
```

### 方式二：从源码安装

```bash
git clone https://github.com/example/auto-research.git
cd auto-research
pip install -e .
```

## 配置

安装完成后，运行初始化命令创建配置文件：

```bash
auto-research init
```

这会在 `~/.auto-research/config.yaml` 生成默认配置。你可以根据需要修改：

```yaml
# config.yaml
search:
  max_sources: 10
  timeout: 30s

output:
  format: markdown
  path: ./output
```

## 第一个任务

让我们执行一个简单的研究任务：

```bash
auto-research run "人工智能在医疗领域的应用"
```

运行后，系统会：

1. **搜索** — 从多个数据源并发搜索相关主题
2. **分析** — 对结果进行聚类和摘要
3. **输出** — 在 `./output` 目录生成结构化报告

## 使用 Python API

你也可以在代码中使用：

```python
from auto_research import ResearchEngine

engine = ResearchEngine()

# 执行研究任务
result = engine.search("量子计算最新进展")

# 打印摘要
print(result.summary)

# 导出为 Markdown
result.export("output.md", format="markdown")
```

## 常见问题

### Q: 搜索超时怎么办？

在配置文件中调大 `search.timeout` 值，或减少 `search.max_sources` 数量。

### Q: 如何添加自定义数据源？

在 `config.yaml` 的 `sources` 字段中添加新的数据源配置即可。

```yaml
sources:
  - name: my_source
    type: api
    endpoint: https://api.example.com/search
```

## 下一步

- 阅读 [API 参考](./api-reference.md) 了解完整接口
- 查看 `examples/` 目录中的更多示例
