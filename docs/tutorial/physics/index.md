# ⚛️ 物理仿真

OrcaGym 的物理仿真基于 MuJoCo 引擎，提供了高精度的刚体动力学和约束求解。

## 物理仿真栈

```
OrcaGym Python API
  └── mujoco.mj_step / mj_forward / mj_inverse
       └── MuJoCo 物理引擎
            ├── 刚体动力学
            ├── 约束求解 (等式 / 不等式)
            ├── 接触检测 (broad phase + narrow phase)
            ├── 接触力计算
            ├── 积分器 (Euler / RK4 / implicit)
            └── 柔性体 (flex) 支持
```

## 章节导航

- [🔧 MuJoCo 后端](mujoco-backend.md) — MuJoCo 模型加载、求解器配置、步进控制
- [📐 状态管理](state-management.md) — qpos/qvel/qacc、状态设置与读取
- [💥 接触与力](contacts-forces.md) — 接触检测、力查询、外力注入
- [🔗 等式约束](equality-constraints.md) — WELD/CONNECT 约束、抓取操作

## 快速参考

| 操作 | API（Euler 推荐） | API（Local 老） | 说明 |
|------|-------------------|-----------------|------|
| 推进 n 步物理 | `env.mj_step(n)` | `env.gym.mj_step(n)` | 执行 n 次物理步进 |
| 前向更新 | `env.mj_forward()` | `env.gym.mj_forward()` | 刷新派生量 |
| 步进+同步（推荐） | `env.do_simulation(ctrl, n)` | `env.do_simulation(ctrl, n)` | 原子操作 |
| 雅可比矩阵 | `env.mj_jacBody(jacp, jacr, name)` | `env.mj_jacBody(jacp, jacr, id)` | 位置/旋转雅可比 |
| 施加外力 | `env.apply_body_force(name, f, τ)` | `env.gym.mj_apply_force_at_site(...)` | 显式力注入 |
| 设置求解器 | `env.sim_config.timestep = 0.002` | `env.gym.set_time_step(0.002)` | 时间步长配置 |
