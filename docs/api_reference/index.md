# 📖 API 参考

OrcaGym 的完整 API 文档。版本：**26.6.1.5** (PyPI: `orca-gym`)。

## 模块索引

| 模块 | 说明 |
|------|------|
| [🧬 Core API](core.md) | `OrcaGymLocal`、`OrcaGymBase`、`OrcaGymModel`、`OrcaGymData`、`OrcaGymOptConfig` |
| [🌍 Environment API](environment.md) | `OrcaGymBaseEnv`、`OrcaGymLocalEnv`、`OrcaGymRemoteEnv`、异步环境 |
| [🎬 Scene API](scene.md) | `OrcaGymScene`、`OrcaGymSceneRuntime`、`Actor` 等场景元素类型 |
| [📷 Sensor API](sensor.md) | `CameraWrapper`、`CameraCacher`、`CameraDataParser`、`Monitor` |
| [🔧 Utils API](utils.md) | `InverseKinematicsController`、`JointController`、`rotations` 旋转工具等 |

## 快速导航

### 新手入门

1. 从 [Environment API](environment.md) 的 `OrcaGymLocalEnv` 开始——这是最常用的入口
2. 了解 [Core API](core.md) 中的 `OrcaGymLocal`——这是底层仿真引擎
3. 查看 [Utils API](utils.md) 中的控制器和旋转工具

### 按任务查找

| 任务 | 相关 API |
|------|----------|
| 创建机器人训练环境 | [Environment API](environment.md) → `OrcaGymLocalEnv` |
| 查询 body/site/joint 状态 | [Core API](core.md) → `OrcaGymLocal` 状态查询 |
| 抓取/拖拽物体 | [Core API](core.md) → `OrcaGymLocal` Mocap + 等式约束 |
| 相机图像获取 | [Sensor API](sensor.md) → `CameraWrapper` |
| 场景中放置物体 | [Scene API](scene.md) → `OrcaGymScene` |
| 逆运动学控制 | [Utils API](utils.md) → `InverseKinematicsController` |
| 关节力矩控制 | [Utils API](utils.md) → `JointController` |
| 旋转/姿态转换 | [Utils API](utils.md) → `rotations` |
| 录制视频 | [Core API](core.md) → `OrcaGymLocal` 视频录制 |

## 顶层导出 (`orca_gym`)

```python
from orca_gym import (
    OrcaGymBase,        # gRPC 基础封装（OrcaGymLocal 的基类）
    OrcaGymModel,       # 静态模型信息（名称↔ID 映射、结构查询）
    OrcaGymData,        # 动态仿真状态（qpos / qvel / qacc / qfrc_bias / time）
    OrcaGymOptConfig,   # MuJoCo 优化配置（求解器、重力、接触参数等）
    OrcaGymLocal,       # 本地 MuJoCo backend（用户最常使用的核心类）
)
```

## 架构总览

```
orca_gym
├── core/                    # 核心仿真层（MuJoCo 封装）
│   ├── orca_gym.py          #   OrcaGymBase（gRPC 基类）
│   ├── orca_gym_local.py    #   OrcaGymLocal（本地 backend）
│   ├── orca_gym_model.py    #   OrcaGymModel（静态信息）
│   ├── orca_gym_data.py     #   OrcaGymData（动态状态）
│   └── orca_gym_opt_config.py # OrcaGymOptConfig（优化配置）
│
├── environment/             # Gymnasium 环境层
│   ├── orca_gym_env.py      #   OrcaGymBaseEnv（抽象基类）
│   ├── orca_gym_local_env.py #  OrcaGymLocalEnv（本地环境）
│   └── async_env/           #   异步/向量化环境
│
├── scene/                   # 场景管理层
│   ├── orca_gym_scene.py    #   OrcaGymScene + 元素类型
│   └── orca_gym_scene_runtime.py # OrcaGymSceneRuntime
│
├── sensor/                  # 传感器层
│   └── rgbd_camera.py       #   CameraWrapper / Cacher / Parser / Monitor
│
└── utils/                   # 工具层
    ├── rotations.py         #   旋转表示转换
    ├── joint_controller.py  #   关节控制器
    ├── inverse_kinematics_controller.py # 逆运动学
    └── ...
```

## 关键概念速查

| 概念 | 说明 | 详见 |
|------|------|------|
| **Body** | 刚体，物理仿真基本单元 | [Core API](core.md) → OrcaGymModel |
| **Joint** | 关节，连接 body 的约束 | [Core API](core.md) → OrcaGymModel |
| **Actuator** | 执行器，驱动机器人的元件 | [Core API](core.md) → OrcaGymModel |
| **Geom** | 几何体，碰撞检测形状 | [Core API](core.md) → OrcaGymModel |
| **Site** | 标记点，不参与物理仿真 | [Core API](core.md) → OrcaGymModel |
| **Sensor** | 传感器，测量物理量 | [Sensor API](sensor.md) |
| **Mocap Body** | 可自由移动的虚拟 body | [Core API](core.md) → Mocap 操作 |
| **Equality Constraint** | 等式约束，连接两个 body | [Core API](core.md) → 等式约束 |
| **qpos** | 广义坐标（关节位置） | [Core API](core.md) → OrcaGymData |
| **qvel** | 广义速度（关节速度） | [Core API](core.md) → OrcaGymData |
| **Flex Body** | 软体/柔体 | [Core API](core.md) → OrcaGymModel flex 方法 |
| **Frame Skip** | 每次 step() 的物理步数 | [Environment API](environment.md) |
