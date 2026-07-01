# 📖 API 参考

OrcaGym 的完整 API 文档。版本：**26.6.1.5** (PyPI: `orca-gym`)。

## 架构体系

OrcaGym 当前包含**两套环境体系**，长期共存、逐步迁移：

| 体系 | 环境类 | Backend 类 | 状态 |
|------|--------|-----------|------|
| **Euler（新主路径）** | `OrcaGymEulerEnv` | `OrcaGymEuler` | ✅ 推荐新项目使用 |
| **Local（老路径）** | `OrcaGymLocalEnv` | `OrcaGymLocal` | 维护模式，逐步废弃 |

Euler 体系遵循五大设计原则：

| 原则 | 含义 | 对比老体系 |
|------|------|-----------|
| **P1 完备性** | 公共 API 覆盖所有合法 MuJoCo 操作 | 老体系大量缺口迫使绕道 `_mjData` |
| **P2 不暴露引擎内部** | `_mjModel`/`_mjData` 不作为公共属性 | 老体系直接暴露 |
| **P3 状态一致性契约** | 写操作后 `self.data` 保证一致 | 老体系 `data` 与 `_mjData` 双轨制 |
| **P4 力应用可追踪** | 外力注入通过显式方法 `apply_body_force()` | 老体系直接写 `xfrc_applied` |
| **P5 职责内聚** | Facade 模式 + 组合优于继承 | 老体系 `OrcaGymLocal` 为上帝类 |

## 模块索引

| 模块 | 说明 |
|------|------|
| [🧬 Core API](core.md) | `OrcaGymEuler`、`OrcaGymLocal`、`SimConfig`、`OrcaGymDataView`、`OrcaGymModel`、`MuJoCoSimCore` 等 |
| [🌍 Environment API](environment.md) | `OrcaGymEulerEnv`、`OrcaGymLocalEnv`、`OrcaGymEnvMixin`、`OrcaGymBaseEnv` 等 |
| [🎬 Scene API](scene.md) | `OrcaGymScene`、`OrcaGymSceneRuntime`、`Actor` 等场景元素类型 |
| [📷 Sensor API](sensor.md) | `CameraWrapper`、`CameraCacher`、`CameraDataParser`、`Monitor` |
| [🔧 Utils API](utils.md) | `InverseKinematicsController`、`JointController`、`rotations` 旋转工具等 |

## 快速导航

### 新手入门

1. 从 [Environment API](environment.md) 的 `OrcaGymEulerEnv` 开始——这是推荐的新入口
2. 了解 [Core API](core.md) 中的 `OrcaGymEuler` 和 `SimConfig`——新的仿真核心与求解器配置
3. 查看 [Utils API](utils.md) 中的控制器和旋转工具

### 按任务查找

| 任务 | 相关 API |
|------|----------|
| 创建机器人训练环境（新） | [Environment API](environment.md) → `OrcaGymEulerEnv` |
| 创建机器人训练环境（老） | [Environment API](environment.md) → `OrcaGymLocalEnv` |
| 读取仿真状态 | `env.data`（`OrcaGymDataView`）→ `env.data.qpos` / `env.data.body_xpos(name)` |
| 设置求解器参数 | `env.sim_config`（`SimConfig`）→ `env.sim_config.timestep = 0.002` |
| 查询 body/site/joint 状态 | `env.query_*()` / `env.get_body_*()` 公共方法 |
| 施加外力 | `env.apply_body_force(name, force, torque)` |
| 抓取/拖拽物体 | [Core API](core.md) → Mocap + 等式约束操作 |
| 相机图像获取 | [Sensor API](sensor.md) → `CameraWrapper` |
| 场景中放置物体 | [Scene API](scene.md) → `OrcaGymScene` |
| 逆运动学控制 | [Utils API](utils.md) → `InverseKinematicsController` |
| 关节力矩控制 | [Utils API](utils.md) → `JointController` |
| 旋转/姿态转换 | [Utils API](utils.md) → `rotations` |
| 录制视频 | [Environment API](environment.md) → `begin_save_video` / `stop_save_video` |

## 顶层导出 (`orca_gym`)

```python
from orca_gym import (
    # Euler 体系（新主路径）
    OrcaGymEuler,           # 仿真核心 Facade
    SimConfig,              # 求解器参数配置（替代直接访问 opt.*）
    OrcaGymDataView,        # 完整状态只读视图（替代直接访问 _mjData）

    # Local 体系（老路径，维护模式）
    OrcaGymBase,            # gRPC 基础封装（OrcaGymLocal 的基类）
    OrcaGymLocal,           # 本地 MuJoCo backend（老体系核心类）
    OrcaGymModel,           # 静态模型信息 — 两套体系共用
    OrcaGymData,            # 老体系动态状态（仅 5 字段：qpos/qvel/qacc/qfrc_bias/time）
    OrcaGymOptConfig,       # 老体系 MuJoCo opt 配置快照
)
```

## 架构总览

```
orca_gym
├── core/                         # 核心仿真层
│   ├── euler/                    #   Euler 体系（新主路径）
│   │   ├── orca_gym_euler.py     #     OrcaGymEuler（仿真核心 Facade）
│   │   ├── mujoco_sim_core.py    #     MuJoCoSimCore（_mjModel/_mjData 唯一存放位置）
│   │   ├── sim_config.py         #     SimConfig（求解器参数 typed 配置）
│   │   ├── orca_gym_data_view.py #     OrcaGymDataView（完整状态只读视图）
│   │   ├── model_registry.py     #     ModelRegistry（模型注册与结构查询）
│   │   └── orca_studio_bridge.py #     OrcaStudioBridge（gRPC 集成，依赖反转）
│   │
│   ├── orca_gym.py               #   OrcaGymBase（gRPC 基类，老体系）
│   ├── orca_gym_local.py         #   OrcaGymLocal（老体系本地 backend）
│   ├── orca_gym_model.py         #   OrcaGymModel（静态信息 - 两套体系共用）
│   ├── orca_gym_data.py          #   OrcaGymData（老体系动态状态）
│   └── orca_gym_opt_config.py    #   OrcaGymOptConfig（老体系 opt 配置快照）
│
├── environment/                  # Gymnasium 环境层
│   ├── euler/                    #   Euler 体系
│   │   └── orca_gym_euler_env.py #     OrcaGymEulerEnv（Facade, 继承 gym.Env + Mixin）
│   ├── orca_gym_env_mixin.py     #   OrcaGymEnvMixin（名称空间/空间生成/reset 编排）
│   ├── orca_gym_env.py           #   OrcaGymBaseEnv（老体系抽象基类）
│   ├── orca_gym_local_env.py     #   OrcaGymLocalEnv（老体系本地环境）
│   └── async_env/                #   异步/向量化环境
│
├── scene/                        # 场景管理层
├── sensor/                       # 传感器层
└── utils/                        # 工具层
```

## Euler 体系对象关系图

```
gym.Env
  └── OrcaGymEulerEnv                     (Facade + 契约执行者)
        │   ↑ OrcaGymEnvMixin（名称空间、空间生成、reset 编排）
        │
        │   组合（非继承）
        ├── _gym: OrcaGymEuler           (仿真核心 Facade，内部对象)
        │     ├── _sim: MuJoCoSimCore    # _mjModel/_mjData 唯一存放位置
        │     ├── _studio: OrcaStudioBridge  # gRPC 集成（依赖反转）
        │     ├── _registry: ModelRegistry  # 模型信息与结构查询
        │     ├── _opt: SimConfig        # 求解器配置（typed）
        │     └── _euler: EulerOrchestrator | None  # Euler 耦合（占位）
        │
        │   公共 API（用户面向）
        ├── .data → OrcaGymDataView      # 完整状态只读视图
        ├── .model → OrcaGymModel        # 模型结构（原样复用）
        ├── .sim_config → SimConfig      # 求解器配置
        └── .ctrl → np.ndarray           # 控制数组
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
| **qpos/qvel/qacc** | 广义坐标/速度/加速度 | [Core API](core.md) → OrcaGymDataView |
| **SimConfig** | 求解器参数 typed 配置（**新**） | [Core API](core.md) → SimConfig |
| **DataView** | 完整状态只读视图（**新**） | [Core API](core.md) → OrcaGymDataView |
| **apply_body_force** | 显式外力注入方法（**新**） | [Environment API](environment.md) |
| **Flex Body** | 软体/柔体 | [Core API](core.md) → OrcaGymModel flex 方法 |
| **Frame Skip** | 每次 step() 的物理步数 | [Environment API](environment.md) |

## ⚠️ API 使用契约（Euler 体系）

Euler 体系通过多层封装隔离机制引导用户走正确路径：

| ✅ 正确 | ❌ 禁止 |
|---------|--------|
| `env.data.qpos` | `env._gym._sim._mjData.qpos` |
| `env.data.body_xpos("link1")` | `env._gym._sim._mjData.body(id).xpos` |
| `env.sim_config.timestep = 0.002` | `env._gym._sim._mjModel.opt.timestep = 0.002` |
| `env.apply_body_force("link1", f, tau)` | `env._gym._sim._mjData.xfrc_applied[id, :3] = f` |
| `env.do_simulation(ctrl, n_frames)` | 直接操作 `_mjData` 步进 |
| `env.query_joint_qpos([...])` | 绕道访问内部 MuJoCo 数据结构 |

> **注意**：`env.gym` / `env.stub` / `env.channel` 在 `OrcaGymEulerEnv` 中**不存在**（Python 原生 `AttributeError`）——这是封装隔离机制的一部分。内部组件通过 `_gym`/`_stub`/`_channel`（下划线前缀）持有，外部代码不应访问。
