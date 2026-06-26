# 安装指南

本指南涵盖 Auto Research 的各种安装方式。

---

## 环境要求

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Python | 3.10+ | 核心运行环境 |
| pip | 22.0+ | 包管理器 |
| Git | 2.30+ | 源码安装时需要 |

可选依赖：

| 依赖 | 用途 |
|------|------|
| Node.js 18+ | Web 数据源渲染 |
| Docker | 容器化部署 |

---

## 方式一：pip 安装（推荐）

```bash
pip install auto-research
```

安装特定版本：

```bash
pip install auto-research==1.2.0
```

验证安装：

```bash
auto-research --version
# auto-research, version 1.2.0
```

---

## 方式二：从源码安装

```bash
git clone https://github.com/example/auto-research.git
cd auto-research
pip install -e .
```

开发模式安装后，修改源码会立即生效，无需重新安装。

---

## 方式三：Docker 部署

```bash
# 拉取镜像
docker pull auto-research:latest

# 运行容器
docker run -it \
  -v $HOME/.auto-research:/root/.auto-research \
  -v $(pwd)/output:/output \
  auto-research:latest
```

### Docker Compose

```yaml
version: "3.8"
services:
  auto-research:
    image: auto-research:latest
    volumes:
      - ~/.auto-research:/root/.auto-research
      - ./output:/output
    environment:
      - AR_LOG_LEVEL=info
```

---

## 平台支持

| 平台 | 状态 |
|------|------|
| Linux (x86_64) | ✅ 完全支持 |
| macOS (Apple Silicon) | ✅ 完全支持 |
| macOS (Intel) | ✅ 完全支持 |
| Windows 10/11 | ✅ 完全支持 |
| Linux (ARM) | ⚠️ 部分功能受限 |

---

## 故障排查

### pip 安装报 `Could not find a version`

检查 Python 版本是否 >= 3.10：

```bash
python --version
```

### 权限错误 (Permission denied)

使用用户安装模式：

```bash
pip install --user auto-research
```
