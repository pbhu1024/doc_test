# 📖 API 参考

OrcaGym 的完整 API 文档。

## 模块索引

| 模块 | 说明 |
|------|------|
| [🧬 Core API](core.md) | `OrcaGymLocal`, `OrcaGymModel`, `OrcaGymData`, `OrcaGymOptConfig` |
| [🌍 Environment API](environment.md) | `OrcaGymBaseEnv`, `OrcaGymLocalEnv`, 异步环境 |
| [🔧 Utils API](utils.md) | `InverseKinematicsController`, `JointController`, 旋转工具 |
| [📷 Sensor API](sensor.md) | `CameraWrapper`, 传感器查询 |
| [🎬 Scene API](scene.md) | `OrcaGymScene`, `OrcaGymSceneRuntime` |

## 顶层导出 (`orca_gym`)

```python
from orca_gym import (
    OrcaGymBase,       # gRPC 基础封装
    OrcaGymModel,      # 静态模型信息
    OrcaGymData,       # 动态仿真状态
    OrcaGymOptConfig,  # MuJoCo opt 配置
    OrcaGymLocal,      # 本地 MuJoCo backend
)
```

## 版本

当前版本：**25.11.1** (PyPI: `orca-gym`)
