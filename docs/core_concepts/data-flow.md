# 🔄 数据流

理解数据在 OrcaGym 各组件之间如何流动是调试和正确使用环境的关键。

## 核心数据流图

```
           RL Policy
               │
               ▼ action (nu,)
    ┌──────────────────────┐
    │   OrcaGymLocalEnv     │
    │   ┌────────────────┐  │
    │   │ do_simulation() │  │
    │   │   ├─ set_ctrl() │  │
    │   │   ├─ mj_step()  │  │
    │   │   └─ update_data()│ │
    │   └───────┬────────┘  │
    │           ▼            │
    │   OrcaGymData          │
    │   (qpos/qvel/qacc/    │
    │    qfrc_bias/time)    │
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

## step() 内的数据流（最详细）

```
env.step(action)
  │
  ├─▶ do_simulation(ctrl, n_frames)
  │     │
  │     ├─▶ set_ctrl(ctrl)          # ctrl → _mjData.ctrl
  │     │     └─▶ [如果存在 override_ctrls, 覆盖对应维度]
  │     │
  │     ├─▶ mj_step(n_frames)       # MuJoCo 物理步进 n_frames 次
  │     │     ├─▶ mj_forward        # 前向动力学
  │     │     ├─▶ mj_Euler          # 欧拉积分
  │     │     └─▶ mj_checkPos/...   # 约束求解
  │     │
  │     └─▶ update_data()           # _mjData → self.data
  │           ├─▶ _qpos_cache[:] = _mjData.qpos
  │           ├─▶ _qvel_cache[:] = _mjData.qvel
  │           ├─▶ _qacc_cache[:] = _mjData.qacc
  │           ├─▶ qfrc_bias = _mjData.qfrc_bias
  │           └─▶ time = _mjData.time
  │
  ├─▶ _get_obs()                    # 子类实现：构建观测
  │     └─▶ 读取 self.data / query_sensor_data / query_body_*
  │
  ├─▶ compute_reward()              # 子类实现：计算奖励
  │     └─▶ 读取 self.data / query_contact_*
  │
  └─▶ render() [可选]
        └─▶ UpdateLocalEnv(qpos, time) → 服务端渲染
        └─▶ 返回 override_ctrls（如果用户在 UI 操作）
```

## 状态修改的强制同步规则

修改状态后，必须执行某些操作以确保数据一致：

```
修改操作                       必须执行的同步操作
─────────────────────────────────────────────────
set_joint_qpos()       →  mj_forward() + update_data()
set_joint_qvel()       →  mj_forward() + update_data()
set_mocap_pos_and_quat() →  mj_forward() + update_data()
mj_step()              →  update_data()
do_simulation()        →  (已内置 update_data())
load_initial_frame()   →  update_data()
```

### 为什么修改 qpos 后需要 mj_forward？

MuJoCo 有很多"派生量"（site/body 位姿、传感器值、接触力等）需要 `mj_forward` 才能刷新。只改 `qpos` 不 `forward`，会导致：

- Body 位姿为 NaN 或旧值
- 传感器数据不正确
- 接触状态不一致

```python
# ✅ 正确
env.set_joint_qpos({"shoulder": np.array([0.5])})
env.mj_forward()      # 刷新所有派生量
env.update_data()     # 同步到 env.data

# ❌ 错误
env.set_joint_qpos({"shoulder": np.array([0.5])})
# 没有 forward —— 读取位姿/传感器可能得到 NaN
body_pos = env.query_body_xpos_xmat_xquat(["end_effector"])  # 可能 NaN！
```

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
| 读到旧状态 | 没调 `update_data()` | step 后确保 update_data 已调用 |
| 位姿 NaN | 修改 qpos 后没调 `mj_forward()` | 修改状态后先 forward |
| 传感器值不变 | sensordata 依赖 forward | `mj_forward()` 后再读传感器 |
| 数据被覆盖 | 使用了 data 引用而非 copy | 始终用 `data.qpos.copy()` |
| 接触力异常 | contact 在 mj_step 后刷新 | step 后立即读接触 |

## 性能分析数据流

OrcaGym 内置了 MuJoCo 性能计时器，可以查看每个计算阶段的耗时：

```python
# 获取 MuJoCo 计时统计
timer_stats = env.gym.get_timer_stats()
# 返回: {"mjTIMER_STEP": (total_sec, count), "mjTIMER_FORWARD": ..., ...}

# 获取约束计数
counts = env.gym.get_constraint_counts()
# 返回: {"nefc": 123, "ncon": 45, "ne": 10, "nf": 5}

# 获取接触来源统计
sources = env.gym.get_contact_sources()
# 返回: {("body_a", "body_b"): contact_count, ...}

# 打印性能概要
env.gym.log_profile(label="step")
```
