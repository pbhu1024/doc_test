# ResearchEngine

核心研究引擎，管理整个研究流程。

---

## 初始化

```python
from auto_research import ResearchEngine

engine = ResearchEngine(
    config_path: str | None = None,
    verbose: bool = False,
    max_workers: int = 4,
)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `config_path` | `str \| None` | `None` | 配置文件路径，为 `None` 时使用默认配置 |
| `verbose` | `bool` | `False` | 是否输出详细日志 |
| `max_workers` | `int` | `4` | 最大并发工作线程数 |

---

## 方法

### search()

执行一次研究搜索。

```python
def search(
    query: str,
    *,
    sources: list[str] | None = None,
    max_results: int = 10,
    language: str = "zh",
) -> SearchResult
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `query` | `str` | — | 搜索查询语句（必填） |
| `sources` | `list[str] \| None` | `None` | 指定数据源列表，为 `None` 时使用全部可用源 |
| `max_results` | `int` | `10` | 每源最大返回结果数 |
| `language` | `str` | `"zh"` | 搜索结果语言偏好 |

**返回值** — `SearchResult` 对象：

```python
@dataclass
class SearchResult:
    query: str              # 原始查询
    items: list[ResultItem] # 搜索结果列表
    total: int              # 结果总数
    elapsed: float          # 耗时（秒）
    summary: str            # 自动生成的摘要
```

### search_async()

`search()` 的异步版本。

```python
async def search_async(
    query: str,
    *,
    sources: list[str] | None = None,
    max_results: int = 10,
    language: str = "zh",
    min_results: int = 0,
) -> SearchResult
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `min_results` | `int` | 最少需要的结果数。不足时自动扩展搜索范围 |

---

### analyze()

对已获取的结果进行深度分析。

```python
def analyze(
    items: list[ResultItem],
    *,
    method: str = "cluster",
    depth: int = 2,
) -> AnalysisReport
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `items` | `list[ResultItem]` | — | 待分析的结果列表 |
| `method` | `str` | `"cluster"` | 分析方法 |
| `depth` | `int` | `2` | 分析深度（1-5） |

分析方法：

| method 值 | 说明 |
|-----------|------|
| `cluster` | 文本聚类，识别主题分布 |
| `summarize` | 生成综合摘要 |
| `sentiment` | 情感极性分析 |
| `trend` | 时间序列趋势 |

---

### export()

将结果导出为文件。

```python
def export(
    result: SearchResult | AnalysisReport,
    path: str,
    *,
    format: str = "markdown",
    template: str | None = None,
) -> str
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `result` | `SearchResult \| AnalysisReport` | — | 待导出的结果对象 |
| `path` | `str` | — | 输出文件路径 |
| `format` | `str` | `"markdown"` | 输出格式：`markdown`、`pdf`、`html`、`json` |
| `template` | `str \| None` | `None` | 自定义 Jinja2 模板路径 |

**返回值**：实际写入的文件绝对路径。

---

### register_source()

注册自定义数据源。

```python
def register_source(source: DataSource) -> None
```

---

### list_sources()

列出所有已注册的数据源。

```python
def list_sources() -> list[str]
```
