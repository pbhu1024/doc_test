# 🔄 数据流

理解数据在 OrcaGym 各组件之间如何流动是调试和正确使用环境的关键。

## 核心数据流图（Euler 体系）

```
           RL Policy
               │
               ▼ action (nu,)
    ┌──────────────────────┐
    │  OrcaGymEulerEnv      │
    │   ┌────────────────┐  │
    │   │ do_simulation() │  │
    │   │   ├─ step_with_coupling()  │  │
    │   │   └─ sync_to_view()       │  │
    │   └───────┬────────┘  │
    │           ▼            │
    │   OrcaGymDataView      │
    │   (qpos/qvel/qacc/    │
    │    time/xfrc_applied/  │
    │    cfrc_ext/...)       │
    │           │            │
    │   ┌───────▼────────┐  │
    │   │ _get_obs()     │──┼──▶ obs
    │   │ compute_reward()│──┼──▶ reward
    │   └────────────────┘  │
    └──────────────────────┘
               │
               ▼ obs (gym.Space)
           RL Policy
```

## step() 内的数据流（Euler 体系，最详细）

```
env.step(action)
  │
  ├─▶ do_simulation(ctrl, n_frames)
  │     │
  │     ├─▶ step_with_coupling(ctrl, n_frames, dt)
  │     │     ├─▶ _sim.set_ctrl(ctrl)      # ctrl → _mjData.ctrl
  │     │     │     └─▶ [如果存在 override_ctrls, 覆盖对应维度]
  │     │     └─▶ _sim.step(n_frames)      # MuJoCo 物理步进
  │     │           ├─▶ mj_forward          # 前向动力学
  │     │           ├─▶ mj_Euler            # 欧拉积分
  │     │           └─▶ mj_checkPos/...     # 约束求解
  │     │
  │     └─▶ sync_to_view()                # _mjData → DataView 零拷贝同步
  │           ├─▶ view.qpos = mj_data.qpos       # 视图（非拷贝）
  │           ├─▶ view.qvel = mj_data.qvel
  │           ├─▶ view.qacc = mj_data.qacc
  │           ├─▶ view.qfrc_bias = mj_data.qfrc_bias
  │           ├─▶ view.time = mj_data.time
  │           ├─▶ view.xfrc_applied = ...（只读保护）
  │           └─▶ view.cfrc_ext = ...
  │
  ├─▶ _get_obs()                          # 子类实现：构建观测
  │     └─▶ 读取 self.data / query_sensor_data / get_body_xpos_xmat_xquat
  │
  ├─▶ compute_reward()                    # 子类实现：计算奖励
  │     └─▶ 读取 self.data / query_contact_*
  │
  └─▶ render() [可选]
        └─▶ _gym.render() → studio.render(qpos, time) → 服务端
        └─▶ 返回 override_ctrls（如果用户在 UI 操作）
```

## 状态修改的强制同步规则

修改状态后，必须执行某些操作以确保数据一致：

```
修改操作                       必须执行的同步操作
─────────────────────────────────────────────────
set_joint_qpos()       →  mj_forward() + sync_to_view()
set_joint_qvel()       →  mj_forward() + sync_to_view()
set_mocap_pos_and_quat() →  mj_forward() + sync_to_view()
mj_step()              →  sync_to_view()
do_simulation()        →  (已内置 sync_to_view())
reset_data()           →  sync_to_view()
```

### 为什么修改 qpos 后需要 mj_forward？

MuJoCo 有很多"派生量"（site/body 位姿、传感器值、接触力等）需要 `mj_forward` 才能刷新。只改 `qpos` 不 `forward`，会导致：

- Body 位姿为 NaN 或旧值
- 传感器数据不正确
- 接触状态不一致

```python
# ✅ 正确（Euler 体系）
env.set_joint_qpos(qpos)
env.mj_forward()          # 刷新所有派生量
env._gym.sync_to_view()   # 同步到 env.data

# ✅ 正确（Local 体系，老）
env.gym.set_joint_qpos({"shoulder": np.array([0.5])})
env.gym.mj_forward()
env.gym.update_data()

# ❌ 错误 —— 两套体系都不能这样
env.set_joint_qpos(...)
# 没有 forward —— 读取位姿/传感器可能得到 NaN
body_pos = env.data.body_xpos("end_effector")  # 可能 NaN！
```

## Euler vs Local 数据流关键差异

| 操作 | Euler 体系 | Local 体系（老） |
|------|-----------|-----------------|
| 数据同步 | `do_simulation()` 末尾自动 `sync_to_view()` | 需显式调用 `update_data()` |
| 数据容器 | `OrcaGymDataView`（零拷贝视图） | `OrcaGymData`（缓存拷贝） |
| 外力写入 | `env.apply_body_force(name, f, tau)` | 直接写 `_mjData.xfrc_applied` |
| xfrc读取 | `env.data.xfrc_applied`（只读保护） | `env.gym._mjData.xfrc_applied` |
| 模型配置 | `env.sim_config.timestep = 0.002` | `env.gym.opt.timestep = 0.002` |
| 数据访问 | 直接 `env.data.qpos` | `env.data.qpos` / `env.gym.data.qpos` |

## 数据读取的线程安全

**OrcaGym 环境不是线程安全的。** 不要在多线程中并发读写同一个环境。

```python
# ❌ 危险
import threading

def worker(env):
    obs = env.step(action)  # 并发调用 → 数据竞争！

# ✅ 正确：使用 Vector Env
from orca_gym.environment.async_env import OrcaGymVectorEnv
vector_env = OrcaGymVectorEnv([make_env() for _ in range(4)])
```

## 常见数据不同步问题

| 现象 | 可能原因 | 解决方法 |
|------|----------|----------|
| 读到旧状态 | 没调数据同步 | Euler: `do_simulation()` 已自动同步；手动操作后调 `sync_to_view()` |
| 位姿 NaN | 修改 qpos 后没调 `mj_forward()` | 修改状态后先 forward |
| 传感器值不变 | sensordata 依赖 forward | `mj_forward()` 后再读传感器 |
| 数据被覆盖 | 使用了 data 引用而非 copy | Euler 零拷贝视图需注意；必要时 `.copy()` |
| 接触力异常 | contact 在 mj_step 后刷新 | step 后立即读接触 |
| AttributeError: 'env' has no 'gym' | 在 Euler 体系用了老 API | 用 `env._gym`（内部）或走公共方法 |

## 性能分析数据流

```python
# Euler 体系——通过 _gym（内部）访问
timer_stats = env._gym.get_timer_stats()
# Local 体系（老）
timer_stats = env.gym.get_timer_stats()

# 获取约束计数
counts = env._gym.get_constraint_counts()
# 返回: {"nefc": 123, "ncon": 45, "ne": 10, "nf": 5}
```
