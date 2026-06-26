# 系统架构

Auto Research 采用模块化的异步架构设计，各组件松耦合、可独立扩展。

---

## 整体架构

```
┌──────────────────────────────────────────────────┐
│                   CLI / Python API                │
│                    (用户交互层)                     │
├──────────────────────────────────────────────────┤
│                  Task Scheduler                   │
│                 (任务调度引擎)                      │
├────────────┬───────────────┬─────────────────────┤
│  Search    │   Analyze     │   Export            │
│  搜索模块   │   分析模块     │   输出模块           │
├────────────┴───────────────┴─────────────────────┤
│              Data Source Adapters                │
│              (数据源适配器层)                       │
├────────────┬───────────────┬─────────────────────┤
│  Cache     │   Config      │   Logging           │
│  缓存层     │   配置管理     │   日志              │
└────────────┴───────────────┴─────────────────────┘
```

---

## 核心模块

### 1. Task Scheduler（任务调度引擎）

负责任务的编排、并发控制和生命周期管理。

```python
from auto_research.core import TaskScheduler

scheduler = TaskScheduler(
    max_concurrency=4,
    retry_policy="exponential_backoff",
)

# 提交任务
task_id = scheduler.submit(search_task)

# 等待完成
result = await scheduler.wait(task_id, timeout=60)
```

关键设计：
- 基于 `asyncio` 的异步任务模型
- 支持任务优先级队列
- 内置重试与熔断机制
- 任务状态可观测（pending / running / done / failed）

### 2. Search Module（搜索模块）

负责与各数据源通信，聚合搜索结果。

```python
from auto_research.search import SearchEngine

engine = SearchEngine(config)

# 并发搜索多个数据源
results = await engine.search_async(
    query="量子计算",
    sources=["arxiv", "semantic_scholar", "news"],
    merge_strategy="dedup_by_title",
)
```

### 3. Analyze Module（分析模块）

对搜索结果进行后处理分析。

| 分析器 | 说明 | 适用场景 |
|--------|------|----------|
| `ClusterAnalyzer` | 基于 TF-IDF + K-Means 的文本聚类 | 主题发现 |
| `SummarizeAnalyzer` | 使用 LLM 生成摘要 | 快速预览 |
| `SentimentAnalyzer` | 情感极性分析 | 舆情监控 |
| `TrendAnalyzer` | 时间序列趋势分析 | 热点追踪 |

### 4. Export Module（输出模块）

将分析结果导出为指定格式。

```python
from auto_research.export import Exporter

exporter = Exporter()
exporter.to_markdown(result, "output.md")
exporter.to_pdf(result, "output.pdf")
exporter.to_html(result, "output.html")
```

---

## 数据流

```
用户输入 query
      │
      ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  搜索阶段     │ ──▶ │   分析阶段     │ ──▶ │   输出阶段    │
│  (并发抓取)   │     │  (聚类/摘要)   │     │  (格式化)    │
└─────────────┘     └──────────────┘     └─────────────┘
      │                     │                     │
      ▼                     ▼                     ▼
  ResultItem[]         AnalysisReport         文件输出
```

---

## 扩展机制

### 自定义数据源

继承 `DataSource` 基类即可添加新的数据源：

```python
from auto_research.sources import DataSource, ResultItem

class RSSSource(DataSource):
    @property
    def name(self) -> str:
        return "rss"

    async def fetch(self, query: str, max_results: int) -> list[ResultItem]:
        # 实现 RSS 抓取逻辑
        ...
```

### 自定义分析器

实现 `Analyzer` 接口：

```python
from auto_research.analyze import Analyzer

class MyAnalyzer(Analyzer):
    async def analyze(self, items: list[ResultItem]) -> AnalysisReport:
        ...
```
