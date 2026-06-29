# 🧠 核心概念

理解 OrcaGym 的核心架构和关键概念。

## 关键对象关系

在 OrcaGym 中，最核心的几个对象是：

```
env (Gymnasium Environment)
  ├── gym (OrcaGymLocal) ── 本地 MuJoCo backend
  │     ├── _mjModel ── MuJoCo 原生模型
  │     ├── _mjData  ── MuJoCo 原生数据
  │     ├── model (OrcaGymModel) ── 封装后的模型信息
  │     ├── data  (OrcaGymData)  ── 封装后的动态状态
  │     └── opt   (OrcaGymOptConfig) ── 优化/物理配置
  ├── model (OrcaGymModel) ── 与 gym.model 相同引用
  └── data  (OrcaGymData)  ── 与 gym.data 相同引用
```

## 概念速查表

| 概念 | 说明 | 谁管理 |
|------|------|--------|
| **Model** | 静态模型信息（几何、关节、执行器、传感器） | `OrcaGymModel` |
| **Data** | 动态仿真状态（qpos、qvel、qacc、time） | `OrcaGymData` |
| **Opt** | MuJoCo 优化配置（timestep、solver、gravity） | `OrcaGymOptConfig` |
| **qpos** | 广义坐标（位置），长度 nq | `_mjData.qpos` |
| **qvel** | 广义速度，长度 nv | `_mjData.qvel` |
| **qacc** | 广义加速度，长度 nv | `_mjData.qacc` |
| **ctrl** | 执行器控制输入，长度 nu | `_mjData.ctrl` |
| **第等式约束** | WELD/CONNECT 约束，用于物体操作 | MuJoCo Model |
| **Mocap Body** | 可通过设置位姿来"操控"的特殊 body | MuJoCo Model |

## 维度约定

OrcaGym 使用 MuJoCo 的维度定义：

| 变量 | 长度 | 含义 |
|------|------|------|
| `model.nq` | 广义坐标数 | qpos 长度 |
| `model.nv` | 自由度数 | qvel/qacc 长度 |
| `model.nu` | 执行器数 | ctrl/action 长度 |
| `model.nbody` | body 数 | — |
| `model.njnt` | 关节数 | — |
| `model.ngeom` | 几何体数 | — |

## 关键数据 shape

| 数据 | Shape | 说明 |
|------|-------|------|
| `qpos` | `(nq,)` | 广义位置 |
| `qvel` | `(nv,)` | 广义速度 |
| `qacc` | `(nv,)` | 广义加速度 |
| `qfrc_bias` | `(nv,)` | 偏置力（重力+科氏力） |
| `ctrl` | `(nu,)` | 控制输入 |
| `xpos` | `(N*3,)` | N 个 body 的 xyz 拼接 |
| `xmat` | `(N*9,)` | N 个 3x3 矩阵按行展开 |
| `xquat` | `(N*4,)` | N 个四元数 |
| `cfrc_ext` | `(nbody, 6)` | 每个 body 的外部约束力 |

## 阅读顺序建议

1. [系统架构](architecture.md) — 理解整体设计
2. [Model / Data / Opt](model-data-opt.md) — 理解三种核心数据对象
3. [Gymnasium 接口](gym-interface.md) — 理解标准 RL 接口实现
4. [数据流](data-flow.md) — 理解数据如何在组件间流动
