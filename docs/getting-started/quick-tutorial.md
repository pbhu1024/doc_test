# 快速教程

通过几个示例快速上手 Auto Research。

---

## 第一个研究任务

### 命令行方式

```bash
auto-research run "人工智能在医疗领域的应用"
```

运行后系统会：

1. **搜索** — 从多个数据源并发搜索相关主题
2. **分析** — 对结果进行聚类和摘要
3. **输出** — 在 `./output` 目录生成结构化报告

### 输出示例

```
🚀 Auto Research v1.2.0
🔍 搜索中... 完成 (12 条结果, 2.3s)
📊 分析中... 完成 (3 个主题簇)
📝 报告已生成: ./output/人工智能在医疗领域的应用.md
```

---

## Python API 方式

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

---

## 进阶用法

### 指定数据源

```bash
# 只使用学术数据源
auto-research run "transformer architecture" --sources arxiv,semantic_scholar
```

```python
result = engine.search(
    "transformer architecture",
    sources=["arxiv", "semantic_scholar"],
    max_results=20,
    language="en",
)
```

### 深度分析

```python
# 先搜索
result = engine.search("新能源汽车 市场趋势")

# 再深度分析
analysis = engine.analyze(
    result.items,
    method="cluster",
    depth=3,
)

# 查看各主题簇
for cluster in analysis.clusters:
    print(f"📌 {cluster.topic} ({cluster.count} 篇)")
    for item in cluster.items[:3]:
        print(f"  - {item.title}")
```

### 自定义模板导出

```bash
auto-research run "5G technology" \
  --output ./reports/5g_report.md \
  --template ./templates/research.j2
```

---

## 完整示例脚本

```python
# research_demo.py
from auto_research import ResearchEngine
from auto_research.sources import RSSSource

async def main():
    # 初始化引擎
    engine = ResearchEngine(verbose=True)

    # 注册自定义数据源
    engine.register_source(RSSSource())

    # 搜索
    result = await engine.search_async(
        "climate change AI solutions",
        sources=["arxiv", "semantic_scholar", "rss"],
        min_results=15,
    )
    print(f"找到 {result.total} 条结果, 耗时 {result.elapsed:.1f}s")

    # 分析
    analysis = await engine.analyze_async(
        result.items,
        method="summarize",
    )
    print(f"摘要:\n{analysis.summary}")

    # 导出
    path = engine.export(analysis, "climate_ai_report.md")
    print(f"报告已保存至: {path}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

---

## 下一步

- 阅读 [配置说明](./configuration.md) 了解所有配置项
- 查看 [API 概览](../api/overview.md) 学习完整接口
- 遇到问题看 [常见问题](./faq.md)
