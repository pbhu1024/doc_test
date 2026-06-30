# 🐋 总览

欢迎来到 **OrcaGym** 文档！

OrcaGym 是由松应科技开发的开源具身仿真框架，提供与 OpenAI Gym/Gymnasium 完全兼容的接口，同时OrcaLab以及OrcaStudio。

---

## 快速了解

OrcaGym 核心特性包括：

- :material-gym: **Gymnasium 兼容** — 与现有 RL 算法无缝集成
- :material-engine: **多物理后端** — 同时支持 MuJoCo/PhysX/ODE
- :material-cloud: **分布式部署** — 通过 gRPC 实现混合本地/远程操作
- :material-camera: **光线追踪渲染** — 逼真的视觉观察
- :material-robot: **多智能体支持** — 原生异构智能体管理

---

## 核心包结构

```
orca_gym/
├── core/           # 核心仿真接口 (OrcaGymLocal, OrcaGymModel, OrcaGymData)
├── environment/    # Gymnasium 兼容的环境基类
│   └── async_env/  # 异步/向量化环境
├── protos/         # gRPC 协议定义
├── scene/          # 场景管理与运行时
├── sensor/         # 传感器 (RGB-D 相机等)
├── utils/          # 工具函数 (旋转、控制器、IK)
├── devices/        # 输入设备 (手柄、键盘)
├── adapters/       # 框架适配器 (RLlib, Robomimic, Robosuite)
├── tools/          # 工具集 (地形生成, HDF5 查看器, 资源处理)
├── scripts/        # CLI 脚本 (仿真循环, 相机监视)
└── log/            # 日志系统
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

从 [安装指南](getting-started/installation.md) 开始，来运行你的第一个仿真！
