# 🐋 总览

欢迎来到 **OrcaGym** 文档！

OrcaGym 是由松应科技开发的开源机器人仿真平台，提供与 OpenAI Gym/Gymnasium 完全兼容的接口，同时支持多物理后端（MuJoCo、PhysX、ODE）和分布式仿真。

---

## 文档导航

| 章节 | 说明 |
|------|------|
| [🐋 什么是 OrcaGym](what-is-orcagym.md) | OrcaGym 是什么，核心功能一览 |
| [🧬 为什么选择 OrcaGym](why-orcagym.md) | 与其他仿真平台的对比与优势 |
| [🛠️ 安装指南](installation.md) | 从 PyPI 或源码安装 |
| [🎯 愿景与路线图](vision.md) | 项目愿景与未来发展方向 |

---

## 快速了解

OrcaGym 是一个 **云原生机器人仿真平台**，核心特性包括：

- :material-gym: **Gymnasium 兼容** — 与现有 RL 算法无缝集成
- :material-engine: **多物理后端** — 同时支持 MuJoCo/PhysX/ODE
- :material-cloud: **分布式部署** — 通过 gRPC 实现混合本地/远程操作
- :material-camera: **光线追踪渲染** — 逼真的视觉观察
- :material-robot: **多智能体支持** — 原生异构智能体管理
- :material-shield: **封装隔离** — Euler 体系通过多层机制引导正确的 API 使用

---

## 核心包结构

```
orca_gym/
├── core/                    # 核心仿真接口
│   ├── euler/               #   Euler 体系（新主路径）
│   │   ├── orca_gym_euler.py     # OrcaGymEuler（仿真核心 Facade）
│   │   ├── mujoco_sim_core.py    # MuJoCoSimCore
│   │   ├── sim_config.py         # SimConfig（typed 求解器配置）
│   │   ├── orca_gym_data_view.py # OrcaGymDataView（完整状态只读视图）
│   │   ├── model_registry.py     # ModelRegistry
│   │   └── orca_studio_bridge.py # OrcaStudioBridge（gRPC 集成）
│   ├── orca_gym_model.py    #   OrcaGymModel（两套体系共用）
│   ├── orca_gym_local.py    #   OrcaGymLocal（老体系）
│   └── ...
├── environment/             # Gymnasium 兼容的环境基类
│   ├── euler/               #   Euler 体系
│   │   └── orca_gym_euler_env.py  # OrcaGymEulerEnv（推荐入口）
│   ├── orca_gym_env_mixin.py      # OrcaGymEnvMixin（两套共用）
│   ├── orca_gym_env.py            # OrcaGymBaseEnv（老体系基类）
│   └── orca_gym_local_env.py      # OrcaGymLocalEnv（老体系）
├── protos/                  # gRPC 协议定义
├── scene/                   # 场景管理与运行时
├── sensor/                  # 传感器 (RGB-D 相机等)
├── utils/                   # 工具函数 (旋转、控制器、IK)
├── devices/                 # 输入设备 (手柄、键盘)
├── adapters/                # 框架适配器 (RLlib, Robomimic, Robosuite)
├── tools/                   # 工具集 (地形生成, HDF5 查看器, 资源处理)
├── scripts/                 # CLI 脚本 (仿真循环, 相机监视)
└── log/                     # 日志系统
```

---

## 谁应该使用 OrcaGym？

- **强化学习研究者** — 需要高性能、标准化的 Gymnasium 环境来训练策略
- **机器人开发者** — 需要与 OrcaStudio、OrcaLab 平台集成的工作流
- **仿真工程师** — 需要多物理后端的灵活性和分布式部署能力
- **教育工作者** — 需要易于上手的机器人仿真教学平台

---

## 配套产品

OrcaGym 是 [松应科技](http://orca3d.cn/) 机器人仿真生态的一部分：

| 产品 | 说明 |
|------|------|
| **OrcaStudio** | 可视化场景编辑与仿真管理工具 |
| **OrcaLab** | 云端机器人训练与评估平台 |
| **OrcaGym** (本仓库) | Python 仿真接口库 |
| **OrcaManipulation** | 遥操作、数据采集与示例库 |

---

## 下一步

从 [安装指南](installation.md) 开始，然后阅读 [Hello OrcaGym](../getting_started/hello-orcagym.md) 来运行你的第一个仿真！
