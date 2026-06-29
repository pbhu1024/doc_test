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

- [🔧 MuJoCo 后端](mujoco-backend.md) — MuJoCo 模型加载、opt 配置、步进控制
- [📐 状态管理](state-management.md) — qpos/qvel/qacc、状态设置与读取
- [💥 接触与力](contacts-forces.md) — 接触检测、力查询、外部力
- [🔗 等式约束](equality-constraints.md) — WELD/CONNECT 约束、抓取操作

## 快速参考

| 操作 | API | 说明 |
|------|-----|------|
| 推进 n 步物理 | `env.gym.mj_step(n)` | 执行 n 次物理步进 |
| 前向更新 | `env.gym.mj_forward()` | 刷新派生量 |
| 逆动力学 | `env.gym.mj_inverse()` | 计算所需的力 |
| 质量矩阵 | `env.gym.mj_fullM()` | (nv, nv) 矩阵 |
| 雅可比矩阵 | `env.gym.mj_jacBody(...)` | 位置/旋转雅可比 |
| 施加外力 | `env.gym.mj_apply_force_at_site(...)` | 在 site 点施力 |
