# 常见问题

使用 Auto Research 时的常见问题与解决方案。

---

## 搜索相关

### Q: 搜索超时怎么办？

在配置文件中调大 `search.timeout` 值，或减少 `search.max_sources` 数量。

```yaml
search:
  timeout: 60s        # 从默认 30s 调大到 60s
  max_sources: 5      # 从默认 10 减少到 5
```

### Q: 搜索结果太少？

1. 检查是否开启了足够的数据源
2. 尝试更通用的关键词
3. 调大 `max_results` 参数

```bash
auto-research run "你的查询" --max-results 30
```

### Q: 如何添加自定义数据源？

在 `config.yaml` 的 `sources` 字段中添加新的数据源配置：

```yaml
sources:
  - name: my_api
    type: api
    endpoint: https://api.example.com/search
    headers:
      Authorization: Bearer ${MY_API_TOKEN}
```

如果是代码方式，继承 `DataSource` 基类：

```python
from auto_research.sources import DataSource

class MySource(DataSource):
    @property
    def name(self):
        return "my_source"

    async def fetch(self, query, max_results):
        # 实现搜索逻辑
        ...
```

---

## 配置相关

### Q: 配置文件在哪里？

默认路径为 `~/.auto-research/config.yaml`。运行 `auto-research init` 可自动生成。

### Q: 如何在不同项目中使用不同配置？

在每个项目根目录放置 `.auto-research.yaml` 文件，该目录下运行时会自动加载。

### Q: 环境变量不生效？

确保写了 `${VAR_NAME}` 格式（带花括号），不带花括号的 `$VAR_NAME` 不会被解析。

---

## 性能相关

### Q: 并发数设多少合适？

| 场景 | 推荐值 |
|------|--------|
| 个人使用 | 4-6 |
| 小团队服务器 | 8-10 |
| 高吞吐场景 | 12-16 |

过高可能触发数据源的速率限制。

### Q: 内存占用过高？

1. 启用缓存大小限制：`cache.max_size: 50MB`
2. 减少 `max_results`
3. 处理完后手动清理缓存：`auto-research cache clear`

---

## 错误排查

### Q: ConnectionError

检查网络连接，确认能访问目标数据源：

```bash
auto-research sources test arxiv
```

### Q: QuotaExceededError

API 配额已用完，等待配额重置或配置 API key 提升额度。

### Q: 编码错误 (UnicodeDecodeError)

在配置文件中指定编码：

```yaml
encoding: utf-8
```

---

## 其他

### Q: 支持离线使用吗？

部分功能支持。启用缓存后，已抓取的数据可离线访问。但搜索新内容需要网络连接。

### Q: 如何贡献代码？

参见项目 [GitHub 仓库](https://github.com/pbhu1024/doc_test)，欢迎提 Issue 和 Pull Request。
