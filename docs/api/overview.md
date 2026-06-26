# API 概览

Auto Research 提供完整的 Python API，所有功能均可通过代码调用。

---

## 快速导入

```python
# 核心引擎
from auto_research import ResearchEngine

# 数据模型
from auto_research.models import SearchResult, ResultItem, AnalysisReport

# 数据源基类
from auto_research.sources import DataSource

# 异常类
from auto_research.errors import (
    AutoResearchError,
    ConnectionError,
    TimeoutError,
    QuotaExceededError,
)
```

---

## 模块结构

```
auto_research/
├── __init__.py          # 公开 API 入口
├── engine.py            # ResearchEngine 核心引擎
├── core/
│   ├── scheduler.py     # 任务调度
│   └── cache.py         # 缓存管理
├── search/
│   ├── engine.py        # 搜索引擎
│   └── merger.py        # 结果合并与去重
├── analyze/
│   ├── cluster.py       # 聚类分析
│   ├── summarize.py     # 摘要生成
│   ├── sentiment.py     # 情感分析
│   └── trend.py         # 趋势分析
├── sources/
│   ├── base.py          # DataSource 基类
│   ├── arxiv.py         # arXiv 适配器
│   ├── semantic.py      # Semantic Scholar 适配器
│   └── web.py           # Web Search 适配器
├── export/
│   ├── markdown.py      # Markdown 导出
│   ├── pdf.py           # PDF 导出
│   ├── html.py          # HTML 导出
│   └── json.py          # JSON 导出
├── models.py            # 数据模型定义
├── config.py            # 配置管理
└── errors.py            # 异常定义
```

---

## 核心类一览

| 类 | 说明 | 文档 |
|-----|------|------|
| `ResearchEngine` | 核心引擎，编排搜索-分析-输出全流程 | [ResearchEngine](./engine.md) |
| `DataSource` | 抽象基类，用于实现自定义数据源 | [数据源接口](./datasource.md) |
| `SearchResult` | 搜索结果数据模型 | [数据模型](./models.md) |
| `AnalysisReport` | 分析报告数据模型 | [数据模型](./models.md) |

---

## 基本用法模式

```python
from auto_research import ResearchEngine

# 1. 初始化
engine = ResearchEngine(config_path="config.yaml", verbose=True)

# 2. 搜索
result = engine.search("your query")

# 3. 分析
analysis = engine.analyze(result.items, method="cluster")

# 4. 导出
engine.export(analysis, "report.md")
```

| 步骤 | 方法 | 返回值 |
|------|------|--------|
| 初始化 | `ResearchEngine(...)` | `ResearchEngine` 实例 |
| 搜索 | `.search(query)` | `SearchResult` |
| 分析 | `.analyze(items)` | `AnalysisReport` |
| 导出 | `.export(result, path)` | `str` (文件路径) |
