# 🎯 愿景与路线图

## 项目愿景

OrcaGym 致力于成为**机器人具身智能训练的通用仿真底座**：

> 让每一个机器人算法研究者都能在高保真、可扩展的仿真环境中自由实验，无需关注底层物理引擎和分布式基础设施的复杂性。

## 核心理念

### 1. 标准接口，自由后端

算法代码只依赖 Gymnasium 接口，底层物理引擎可自由切换，实现**算法与仿真解耦**。

### 2. 云端原生，弹性扩展

从单机开发到大规模集群训练，OrcaGym 提供**一致的编程体验**。

### 3. 开源开放，生态共建

MIT 许可证，欢迎社区贡献，与 OrcaManipulation 等项目一起构建丰富的机器人应用生态。

## 项目生态

```
           ┌──────────────────────────────────┐
           │          OrcaManipulation         │
           │  (遥操作 / 数据采集 / 应用示例)      │
           └──────────────┬───────────────────┘
                          │ 依赖
           ┌──────────────▼───────────────────┐
           │            OrcaGym               │  ← 本仓库
           │   (核心仿真接口 / Gymnasium API)    │
           └──────────────┬───────────────────┘
                          │ 通信
           ┌──────────────▼───────────────────┐
           │     OrcaStudio / OrcaLab          │
           │   (场景编辑 / 物理引擎 / 渲染)      │
           └──────────────────────────────────┘
```

## 路线图

### ✅ 已完成

- Gymnasium API 完全兼容
- MuJoCo 本地后端（`OrcaGymLocal`）
- gRPC 远程通信架构
- 多智能体环境支持
- 等式约束 + Mocap 物体操作
- 逆运动学控制器
- RGB-D 相机传感器
- Stable-Baselines3 / RLlib 适配
- Robomimic / Robosuite 适配
- Isaac Gym 迁移指南
- PyPI 发布（`orca-gym`）

### 🚧 进行中

- 更多物理后端集成（PhysX、ODE）
- 强化学习基准测试套件
- 文档完善与教程

### 🔮 计划中

- GPU 加速的并行仿真
- 更多传感器类型（激光雷达、触觉阵列）
- 软体机器人支持
- 流体仿真集成
- 域随机化工具集
- Sim2Real 验证工具链

## 贡献方式

欢迎通过以下方式参与：

- :material-github: [GitHub Issues](https://github.com/openverse-orca/OrcaGym/issues) — 报告 bug、提出功能建议
- :material-source-pull: Pull Requests — 代码贡献
- :material-book: 文档完善 — 改进本中文文档
- :material-robot: 示例任务 — 贡献新的机器人仿真环境

详见 [贡献指南](https://github.com/openverse-orca/OrcaGym#贡献)。

## 联系方式

- 邮箱：huangwei@orca3d.cn
- 官方门户：[http://orca3d.cn/](http://orca3d.cn/)
- GitHub：[https://github.com/openverse-orca/OrcaGym](https://github.com/openverse-orca/OrcaGym)
