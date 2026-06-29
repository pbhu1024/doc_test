# 🏗️ 第一个环境 — 写自己的环境类

上一节我们用 `OrcaGymScene` 搭了场景。这一节，你将学会如何**写一个环境类**来控制这个场景。

---

## 为什么要写环境类？

`OrcaGymScene` 只能**搭建**场景（添加/删除物体），不能**控制**仿真（物理步进、读取状态）。要控制仿真，你需要继承 `OrcaGymLocalEnv`。

一个环境类 = 场景的"驱动程序"：

```
OrcaGymScene  →  搭建场景（一次性）
OrcaGymLocalEnv →  驱动仿真（循环运行）
```

---

## 最小环境骨架

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
my_first_env.py — 一个最小的自定义环境
"""

import numpy as np
from orca_gym.environment.orca_gym_local_env import OrcaGymLocalEnv


class MyFirstEnv(OrcaGymLocalEnv):
    """最简环境：观测 = 关节位置，动作 = 力矩控制，奖励 = 0"""

    def __init__(self, frame_skip, orcagym_addr, agent_names, time_step, **kwargs):
        # ── 父类初始化 ──
        # 自动完成：gRPC连接 → 下载模型 → 初始化MuJoCo → 保存初始状态
        super().__init__(
            frame_skip=frame_skip,
            orcagym_addr=orcagym_addr,
            agent_names=agent_names,
            time_step=time_step,
            **kwargs,
        )

        # ── 保存常用维度 ──
        self.nq = self.model.nq  # 位置状态维度（所有关节位置 + 自由物体位姿）
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
        # 先取一个样本观测，再用它推断空间
        sample = self._get_obs()
        self.observation_space = self.generate_observation_space(sample)

    # ── 观测获取 ───────────────────────────────────────
    def _get_obs(self) -> dict:
        """返回当前状态的字典。这是策略"看到"的信息。"""
        return {
            "joint_pos": self.data.qpos[:self.nq].copy(),  # .copy() 很重要！
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

        # 2. 执行仿真：设置力矩 → 物理步进 → 同步数据
        self.do_simulation(ctrl, self.frame_skip)

        # 3. 获取新观测
        obs = self._get_obs()

        # 4. 奖励 & 终止（这里留空，后面学）
        reward = 0.0
        terminated = False
        truncated = False

        return obs, reward, terminated, truncated, {}

    # ── 重置 ───────────────────────────────────────────
    def reset_model(self) -> tuple:
        """回到初始状态。父类已恢复 qpos/qvel。"""
        self.ctrl = np.zeros(self.nu, dtype=np.float32)
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

---

## 核心概念拆解

### `do_simulation` — 一步到位的仿真步进

```python
self.do_simulation(ctrl, self.frame_skip)
```

这一行等价于：

```python
self.set_ctrl(ctrl)               # 1. 把力矩写进执行器
self.mj_step(nstep=self.frame_skip)  # 2. 物理引擎算 20 步
self.gym.update_data()            # 3. 把新状态同步到 self.data
```

### `self.data` — 动态状态的"快照"

每步 `do_simulation` 后，`self.data` 中的值会更新：

| 属性 | 含义 | 形状 | 类比 |
|------|------|------|------|
| `self.data.qpos` | 广义位置 | `(nq,)` | 所有关节的角度 + 自由物体的位姿 |
| `self.data.qvel` | 广义速度 | `(nv,)` | 所有关节的角速度 + 自由物体的速度 |
| `self.data.qacc` | 广义加速度 | `(nv,)` | 所有关节的角加速度 |

!!! warning "记得 `.copy()`！"
    ```python
    # ✅ 正确
    pos = self.data.qpos.copy()
    
    # ❌ 错误 — pos 是内部缓冲区的引用，下一步会被覆盖！
    pos = self.data.qpos
    ```

### 动作归一化

```python
# 策略输出 ∈ [-1, 1]
# 映射到实际力矩范围
ctrl = ctrl_low + (action + 1.0) / 2.0 * (ctrl_high - ctrl_low)
```

这样做的好处：不同机器人的力矩范围不同，但策略只需要输出 `[-1, 1]`。

### 环境生命周期

```
gym.make("MyFirstEnv-v0")
  └── __init__()
        ├── super().__init__()
        │     ├── 建 gRPC 连接
        │     ├── 下载模型 XML → 初始化 MuJoCo
        │     ├── 加载初始帧 → 保存 init_qpos/init_qvel
        │     └── model, data 就绪
        ├── self.nq / self.nv / self.nu
        ├── _set_action_space()
        └── _set_obs_space()

env.reset()
  ├── 父类: reset_simulation() → 恢复初始状态
  └── reset_model() → 你的自定义逻辑

env.step(action)  ← 重复 N 次
  ├── 去归一化动作
  ├── do_simulation(ctrl, frame_skip)
  ├── _get_obs()
  └── 返回 (obs, reward, terminated, truncated, info)

env.close()
  └── 关闭 gRPC
```

---

## 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `ValueError: Action dimension mismatch` | `action.shape` ≠ `(nu,)` | 检查 `len(action)` 是否等于 `env.model.nu` |
| 观测数据"不对" | 没 `.copy()` | 所有 `self.data.*` 都要 `.copy()` |
| 观测全是 NaN | 在 `mj_forward()` 前读了 data | 用 `do_simulation()` 代替手动操作 |

---

## 下一步

环境类写好了。接下来学习如何**读取更多状态信息**：[📡 读取状态](state-queries.md)。
