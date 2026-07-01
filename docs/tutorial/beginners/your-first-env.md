# 🏗️ 第一个环境 — 写自己的环境类

上一节我们用 `OrcaGymScene` 搭了场景。这一节，你将学会如何**写一个环境类**来控制这个场景。

## 为什么要写环境类？

`OrcaGymScene` 只能**搭建**场景（添加/删除物体），不能**控制**仿真（物理步进、读取状态）。要控制仿真，你需要继承环境基类。

**推荐使用 `OrcaGymEulerEnv`**（新主路径），备选 `OrcaGymLocalEnv`（老路径，维护模式）。

一个环境类 = 场景的"驱动程序"：

```
OrcaGymScene  →  搭建场景（一次性）
OrcaGymEulerEnv →  驱动仿真（循环运行）
```

## 最小环境骨架（Euler 体系，推荐）

环境类需要实现 4 个方法：

```
__init__()       — 初始化（设置动作空间、观测空间）
step(action)     — 执行一步仿真，返回观测和奖励
reset_model()    — 重置到初始状态
_get_obs()       — 收集观测数据
```

下面是一个**最小可运行**的环境：

```python
"""
my_first_env.py — 一个最小的自定义环境（Euler 体系）
"""

import numpy as np
from orca_gym.environment.euler.orca_gym_euler_env import OrcaGymEulerEnv


class MyFirstEnv(OrcaGymEulerEnv):
    """最简环境：观测 = 关节位置，动作 = 力矩控制，奖励 = 0"""

    def __init__(self, frame_skip, orcagym_addr, agent_names, time_step, **kwargs):
        # ── 父类初始化（自主编排生命周期）──
        super().__init__(
            frame_skip=frame_skip,
            orcagym_addr=orcagym_addr,
            agent_names=agent_names,
            time_step=time_step,
            **kwargs,
        )

        # ── 保存常用维度 ──
        self.nq = self.model.nq  # 位置状态维度
        self.nv = self.model.nv  # 速度状态维度
        self.nu = self.model.nu  # 执行器数量（动作维度）

        # ── 设置动作空间和观测空间 ──
        self._set_action_space()
        self._set_obs_space()

    # ── 动作空间 ───────────────────────────────────────
    def _set_action_space(self):
        """动作：归一化到 [-1, 1] 的力矩"""
        if self.nu > 0:
            bounds = np.array([[-1.0, 1.0]] * self.nu)
            self.action_space = self.generate_action_space(bounds)

    # ── 观测空间 ───────────────────────────────────────
    def _set_obs_space(self):
        sample = self._get_obs()
        self.observation_space = self.generate_observation_space(sample)

    # ── 观测获取 ───────────────────────────────────────
    def _get_obs(self) -> dict:
        """返回当前状态的字典。这是策略"看到"的信息。"""
        return {
            "joint_pos": self.data.qpos[:self.nq].copy(),
            "joint_vel": self.data.qvel[:self.nv].copy(),
        }

    # ── 仿真步进 ───────────────────────────────────────
    def step(self, action: np.ndarray):
        """
        执行一步仿真。
        action: 形状 (nu,)，每个值 ∈ [-1, 1]
        """
        # 1. 将归一化动作映射到实际力矩范围
        ctrlrange = self.model.get_actuator_ctrlrange()  # (nu, 2)
        ctrl_low = ctrlrange[:, 0]
        ctrl_high = ctrlrange[:, 1]
        ctrl = ctrl_low + (action + 1.0) / 2.0 * (ctrl_high - ctrl_low)

        # 2. 执行仿真：do_simulation 内部自动同步 data
        self.do_simulation(ctrl, self.frame_skip)

        # 3. 获取新观测
        obs = self._get_obs()

        # 4. 奖励 & 终止
        reward = 0.0
        terminated = False
        truncated = False

        return obs, reward, terminated, truncated, {}

    # ── 重置 ───────────────────────────────────────────
    def reset_model(self) -> tuple:
        """回到初始状态"""
        self.set_joint_qpos(self.init_qpos)
        self.set_joint_qvel(self.init_qvel)
        self.mj_forward()
        self._sync_view()
        return self._get_obs(), {}


# ============================================================
# 注册 & 使用
# ============================================================
import gymnasium as gym

gym.register(
    id="MyFirstEnv-v0",
    entry_point="my_first_env:MyFirstEnv",
    kwargs={
        'frame_skip': 20,
        'orcagym_addr': "localhost:50051",
        'agent_names': ["robot_0"],
        'time_step': 0.001,
    },
    max_episode_steps=500,
)

# 使用
if __name__ == "__main__":
    env = gym.make("MyFirstEnv-v0")
    obs, _ = env.reset()
    print(f"观测: {list(obs.keys())}")
    print(f"  joint_pos shape: {obs['joint_pos'].shape}")
    print(f"  动作空间: {env.action_space}")

    for i in range(10):
        action = env.action_space.sample()  # 随机动作
        obs, reward, terminated, truncated, _ = env.step(action)
        env.render()
        print(f"  Step {i}: reward={reward:.3f}")

    env.close()
```

## 核心概念拆解

### `do_simulation` — 一步到位的仿真步进

```python
self.do_simulation(ctrl, self.frame_skip)
```

这一行在 Euler 体系中等价于：

```python
# 内部：_gym.step_with_coupling(ctrl, n_frames, dt)
#     → _sim.set_ctrl(ctrl) + _sim.step(n_frames)
# 然后：_gym.sync_to_view()
# data 自动同步为最新状态
```

> **关键优势**：`do_simulation()` 返回后 `self.data` 已自动更新，无需手动 `update_data()`。

### `self.data` — 完整状态只读视图

Euler 体系中 `self.data` 是 `OrcaGymDataView`，提供零拷贝只读视图：

| 属性 | 含义 | 形状 |
|------|------|------|
| `self.data.qpos` | 广义位置 | `(nq,)` |
| `self.data.qvel` | 广义速度 | `(nv,)` |
| `self.data.qacc` | 广义加速度 | `(nv,)` |
| `self.data.time` | 仿真时间 | 标量 |
| `self.data.body_xpos(name)` | body 世界位置 | `(3,)` |

> ⚠️ Euler 体系的 DataView 是零拷贝视图，直接读即可。若需保存历史值，调用 `.copy()`。

### 动作归一化

```python
# 策略输出 ∈ [-1, 1]
# 映射到实际力矩范围
ctrl = ctrl_low + (action + 1.0) / 2.0 * (ctrl_high - ctrl_low)
```

这样做的好处：不同机器人的力矩范围不同，但策略只需要输出 `[-1, 1]`。

### 环境生命周期（Euler 体系）

```
MyFirstEnv(...)
  └── OrcaGymEulerEnv.__init__()
        ├── initialize_grpc()       # 创建 _gym/_stub/_channel
        ├── pause_simulation()
        ├── set_time_step(time_step)
        ├── initialize_simulation() # 加载模型 → init_simulation
        ├── reset_simulation()      # reset_data + sync_to_view
        └── init_qpos_qvel()        # 缓存初始状态

env.reset()  [来自 OrcaGymEnvMixin]
  ├── reset_simulation() → 恢复初始状态
  └── reset_model() → 你的自定义逻辑

env.step(action)  ← 重复 N 次
  ├── 去归一化动作
  ├── do_simulation(ctrl, frame_skip)
  ├── _get_obs()
  └── 返回 (obs, reward, terminated, truncated, info)

env.close()
  └── 关闭 gRPC
```

## 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `ValueError: Action dimension mismatch` | `action.shape` ≠ `(nu,)` | 检查 `len(action)` 是否等于 `env.model.nu` |
| 观测数据"不对" | 没在 `mj_forward()` 后读 data | 回 `reset_model` 中确认 `mj_forward()` + `_sync_view()` 已调用 |
| 观测全是 NaN | 在 `mj_forward()` 前读了 data | 用 `do_simulation()` 代替手动操作 |
| `AttributeError: 'OrcaGymEulerEnv' object has no attribute 'gym'` | 在 Euler 体系用了老 API | `env.gym` 在 Euler 中不存在，用 `env._gym`（内部）或公共 API |

## 下一步

环境类写好了。接下来学习如何**读取更多状态信息**：[📡 读取状态](state-queries.md)。
