# ⚛️ 物理仿真

OrcaGym 的物理仿真基于 MuJoCo 引擎，提供了高精度的刚体动力学和约束求解。

## 章节导航

- [🔧 MuJoCo 后端](mujoco-backend.md) — 模型加载、求解器配置、步进控制
- [📐 状态管理](state-management.md) — qpos/qvel/qacc、状态设置与读取
- [💥 接触与力](contacts-forces.md) — 接触检测、力查询、外力注入
- [🔗 等式约束](equality-constraints.md) — WELD/CONNECT 约束、抓取操作

## 快速参考

| 操作 | API | 说明 |
|------|-----|------|
| 步进+同步（推荐） | `env.do_simulation(ctrl, n)` | 原子操作，自动同步数据 |
| 推进 n 步物理 | `env.mj_step(n)` | 执行 n 次物理步进 |
| 前向更新 | `env.mj_forward()` | 刷新派生量 |
| 雅可比矩阵 | `env.mj_jacBody(jacp, jacr, name)` | 位置/旋转雅可比 |
| 施加外力 | `env.apply_body_force(name, f, τ)` | 显式力注入 |
| 设置求解器 | `env.sim_config.timestep = 0.002` | 时间步长配置 |

## 物理引擎关键参数

通过 `env.sim_config` 配置：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `timestep` | 0.002 | 物理仿真步长（秒） |
| `iterations` | 100 | 求解器迭代次数 |
| `integrator` | 0 (Euler) | 积分器类型 |
| `gravity` | `[0, 0, -9.81]` | 重力向量 |
| `tolerance` | 1e-8 | 求解器容忍度 |
