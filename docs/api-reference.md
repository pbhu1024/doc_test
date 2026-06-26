# API 参考

本文档列出了 Auto Research 所有公开 API 的详细说明。

## ResearchEngine

核心研究引擎，管理整个研究流程。

### 初始化

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

**返回值**

`SearchResult` 对象：

```python
@dataclass
class SearchResult:
    query: str              # 原始查询
    items: list[ResultItem] # 搜索结果列表
    total: int              # 结果总数
    elapsed: float          # 耗时（秒）
    summary: str            # 自动生成的摘要
```

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
| `method` | `str` | `"cluster"` | 分析方法：`cluster`（聚类）、`summarize`（摘要）、`sentiment`（情感） |
| `depth` | `int` | `2` | 分析深度（1-5），越大越详细 |

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

## DataSource（抽象基类）

自定义数据源需要继承此基类。

```python
from auto_research.sources import DataSource

class MyCustomSource(DataSource):
    @property
    def name(self) -> str:
        return "my_source"

    async def fetch(self, query: str, max_results: int) -> list[ResultItem]:
        # 实现你的搜索逻辑
        ...
```

### 必须实现的方法

| 方法 | 说明 |
|------|------|
| `name` (属性) | 返回数据源名称，全局唯一 |
| `fetch(query, max_results)` | 异步执行搜索，返回 `list[ResultItem]` |

### 可选覆盖的方法

| 方法 | 默认行为 | 说明 |
|------|----------|------|
| `validate_config(config)` | 不做校验 | 校验数据源配置是否合法 |
| `health_check()` | 返回 `True` | 检查数据源是否可用 |

---

## 错误处理

所有 API 错误继承自 `AutoResearchError`：

```python
try:
    result = engine.search("...")
except ConnectionError:
    print("网络连接失败，请检查网络设置")
except TimeoutError:
    print("搜索超时，请调整 timeout 参数")
except QuotaExceededError:
    print("API 配额已用完")
except AutoResearchError as e:
    print(f"未知错误: {e}")
```

### 异常层级

```
AutoResearchError
├── ConnectionError
├── TimeoutError
├── QuotaExceededError
├── ParseError
└── ConfigurationError
```

---

## CLI 命令参考

```bash
# 执行研究
auto-research run <query> [--sources S1,S2] [--output PATH]

# 查看可用数据源
auto-research sources list

# 测试数据源连接
auto-research sources test <name>

# 查看版本
auto-research --version
```

| 全局参数 | 简写 | 说明 |
|----------|------|------|
| `--verbose` | `-v` | 输出详细日志 |
| `--config` | `-c` | 指定配置文件路径 |
| `--quiet` | `-q` | 静默模式，只输出结果 |
