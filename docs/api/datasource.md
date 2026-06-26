# 数据源接口

自定义数据源需要继承 `DataSource` 抽象基类。

---

## DataSource 基类

```python
from auto_research.sources import DataSource, ResultItem

class MyCustomSource(DataSource):
    @property
    def name(self) -> str:
        return "my_source"

    async def fetch(self, query: str, max_results: int) -> list[ResultItem]:
        # 实现你的搜索逻辑
        ...
```

---

## 必须实现的方法

### name (属性)

返回数据源名称，必须全局唯一。

```python
@property
def name(self) -> str:
    return "unique_source_name"
```

### fetch()

异步执行搜索，返回 `ResultItem` 列表。

```python
async def fetch(
    self,
    query: str,
    max_results: int,
) -> list[ResultItem]:
    ...
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `query` | `str` | 搜索关键词 |
| `max_results` | `int` | 期望的最大返回条数 |

---

## 可选覆盖的方法

### validate_config()

校验数据源配置是否合法。

```python
def validate_config(self, config: dict) -> bool:
    if "api_key" not in config:
        raise ValueError("api_key is required")
    return True
```

### health_check()

检查数据源是否可用。

```python
async def health_check(self) -> bool:
    try:
        await self.fetch("test", 1)
        return True
    except Exception:
        return False
```

### rate_limit()

返回每秒最大请求数（用于自动限速）。

```python
@property
def rate_limit(self) -> float:
    return 5.0  # 每秒 5 次
```

---

## ResultItem 数据模型

```python
@dataclass
class ResultItem:
    title: str          # 标题
    url: str            # 来源 URL
    snippet: str        # 摘要片段
    source: str         # 数据源名称
    published: datetime | None  # 发布日期
    authors: list[str]  # 作者列表
    citations: str | None  # 引用信息 (BibTeX/DOI)
    metadata: dict      # 额外的元数据
```

---

## 完整示例

### REST API 数据源

```python
import aiohttp
from auto_research.sources import DataSource, ResultItem
from datetime import datetime

class MyAPISource(DataSource):
    def __init__(self, api_key: str):
        self.api_key = api_key
        self._session = None

    @property
    def name(self) -> str:
        return "my_api"

    @property
    def rate_limit(self) -> float:
        return 10.0

    def validate_config(self, config: dict) -> bool:
        assert config.get("api_key"), "api_key required"
        return True

    async def health_check(self) -> bool:
        try:
            results = await self.fetch("test", 1)
            return len(results) >= 0
        except Exception:
            return False

    async def fetch(self, query: str, max_results: int) -> list[ResultItem]:
        if not self._session:
            self._session = aiohttp.ClientSession()

        url = "https://api.example.com/v1/search"
        params = {"q": query, "limit": max_results}
        headers = {"Authorization": f"Bearer {self.api_key}"}

        async with self._session.get(url, params=params, headers=headers) as resp:
            data = await resp.json()

        return [
            ResultItem(
                title=item["title"],
                url=item["link"],
                snippet=item.get("snippet", ""),
                source=self.name,
                published=datetime.fromisoformat(item["date"]) if item.get("date") else None,
                authors=item.get("authors", []),
                citations=item.get("doi"),
                metadata={"raw": item},
            )
            for item in data["results"][:max_results]
        ]

    async def close(self):
        if self._session:
            await self._session.close()
```

### 注册和使用

```python
engine = ResearchEngine()
engine.register_source(MyAPISource(api_key="your-key"))

result = engine.search(
    "machine learning",
    sources=["arxiv", "my_api"],  # 与内置源混合使用
)
```
