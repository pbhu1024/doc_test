# 错误处理

Auto Research 提供了一套清晰的异常层级体系。

---

## 异常层级

```
AutoResearchError
├── ConnectionError        # 网络连接失败
├── TimeoutError           # 请求超时
├── QuotaExceededError     # API 配额不足
├── ParseError             # 数据解析失败
├── ConfigurationError     # 配置错误
│   ├── MissingConfigError
│   └── InvalidConfigError
└── SourceError            # 数据源异常
    ├── SourceUnavailableError
    └── SourceAuthError
```

---

## 异常说明

### AutoResearchError

所有异常的基类。

```python
try:
    ...
except AutoResearchError as e:
    print(f"Auto Research 错误: {e}")
```

### ConnectionError

网络连接失败时抛出。

```python
try:
    result = engine.search("...")
except ConnectionError:
    print("网络连接失败，请检查网络设置")
```

### TimeoutError

请求超过配置的超时时间。

```python
try:
    result = engine.search("...")
except TimeoutError:
    print("搜索超时，请调整 timeout 参数或减少数据源数量")
```

### QuotaExceededError

API 配额已用完。

```python
try:
    result = engine.search("...")
except QuotaExceededError:
    print("API 配额已用完，请等待重置或配置 API key")
```

### ConfigurationError

配置错误（格式、缺少必填项等）。

```python
try:
    engine = ResearchEngine(config_path="invalid.yaml")
except ConfigurationError as e:
    print(f"配置错误: {e}")
```

---

## 捕获建议

### 典型使用

```python
from auto_research import ResearchEngine
from auto_research.errors import (
    ConnectionError,
    TimeoutError,
    QuotaExceededError,
    AutoResearchError,
)

engine = ResearchEngine()

try:
    result = engine.search("quantum computing")
except ConnectionError:
    # 网络问题 —— 可以稍后重试
    ...
except TimeoutError:
    # 超时 —— 尝试减少数据源或增大超时
    ...
except QuotaExceededError:
    # 配额 —— 等待或切换数据源
    ...
except AutoResearchError as e:
    # 其他已知错误
    ...
```

### 带重试的搜索

```python
import asyncio
from auto_research.errors import ConnectionError, TimeoutError

async def search_with_retry(engine, query, max_retries=3):
    for attempt in range(max_retries):
        try:
            return await engine.search_async(query)
        except (ConnectionError, TimeoutError) as e:
            if attempt == max_retries - 1:
                raise
            wait = 2 ** attempt
            print(f"重试 {attempt + 1}/{max_retries}，等待 {wait}s...")
            await asyncio.sleep(wait)
```

---

## 错误信息结构

所有异常包含以下属性：

| 属性 | 说明 |
|------|------|
| `message` | 人类可读的错误描述 |
| `code` | 错误码（如 `CONN_ERR`、`TIMEOUT`） |
| `source` | 出错的模块/数据源名称 |
| `details` | 附加的上下文信息（dict） |

```python
try:
    ...
except AutoResearchError as e:
    print(f"[{e.code}] {e.message}")
    print(f"来源: {e.source}")
    print(f"详情: {e.details}")
```
