# 🏆 搭建一个任务 — 组合所有知识

这是新手教程的收官之作。我们将把前面学到的所有知识组合起来，搭建一个完整的任务：

> **让机械臂末端到达随机指定的目标点。**

**不使用 RL**——我们将手动编写控制逻辑（PD 控制器 + 简单的轨迹规划）。

---

## 任务定义

```
┌─────────────────────────────────────────┐
│  任务：Reach Target                     │
│                                         │
│  输入（观测）：                          │
│    - 关节角度                           │
│    - 末端执行器位置                     │
│    - 目标位置                           │
│                                         │
│  输出（动作）：                          │
│    - 每个关节的目标角度                  │
│                                         │
│  成功条件：                              │
│    - 末端到目标的距离 < 5mm              │
│                                         │
│  内部控制器：                            │
│    - PD 控制器（目标角度 → 力矩）        │
└─────────────────────────────────────────┘
```

---

## 完整代码

```python
"""
reach_target_task.py — 完整的机械臂到达任务

整合了前面教程的所有知识：
- OrcaGymLocalEnv 子类化  (教程 3)
- 状态查询                   (教程 4)
- 关节控制                   (教程 5)
- PD 控制器                  (教程 7)

运行方式:
    python reach_target_task.py
"""

import numpy as np
import time
import gymnasium as gym
from gymnasium import spaces

from orca_gym.environment.orca_gym_local_env import OrcaGymLocalEnv
from orca_gym.log.orca_log import get_orca_logger

_logger = get_orca_logger()


# ============================================================
# PD 控制器（来自教程 7）
# ============================================================
class PDController:
    """多关节 PD 控制器"""

    def __init__(self, nu: int, kp: float = 150.0, kd: float = 12.0):
        self.nu = nu
        self.kp = np.full(nu, kp, dtype=np.float64)
        self.kd = np.full(nu, kd, dtype=np.float64)

    def compute(self, target_qpos, current_qpos, current_qvel):
        pos_error = target_qpos - current_qpos[:self.nu]
        vel_error = np.zeros(self.nu) - current_qvel[:self.nu]
        return (self.kp * pos_error + self.kd * vel_error).astype(np.float64)


# ============================================================
# 主任务环境
# ============================================================
class ReachTargetTask(OrcaGymLocalEnv):
    """
    机械臂末端到达目标点任务。

    这个环境展示了如何将多个组件（状态查询、PD控制、奖励计算）
    组合成一个完整的工作任务。
    """

    # ── 任务参数 ──
    SUCCESS_THRESHOLD = 0.005   # 到达阈值（5mm）
    MAX_DELTA = 0.05            # 每步关节角度最大变化
    GOAL_WORKSPACE = np.array([0.2, -0.3, 0.1,   # [x_min, y_min, z_min,
                                0.6,  0.3, 0.5])  #  x_max, y_max, z_max]

    def __init__(self, frame_skip, orcagym_addr, agent_names, time_step, **kwargs):
        # ── 父类初始化（gRPC 连接 → 模型加载 → 初始状态保存）──
        super().__init__(frame_skip, orcagym_addr, agent_names, time_step, **kwargs)

        self.nq = self.model.nq
        self.nv = self.model.nv
        self.nu = self.model.nu

        # ── 任务状态 ──
        self._goal_pos = np.zeros(3)      # 目标位置（每 episode 随机采样）
        self._step_count = 0              # 当前步数

        # ── PD 控制器 ──
        self._pd = PDController(nu=self.nu, kp=150.0, kd=12.0)

        # ── 初始化空间 ──
        self._set_action_space()
        self._set_obs_space()

        _logger.info(f"ReachTargetTask 就绪: "
                     f"nu={self.nu}, dt={self.dt:.4f}s, "
                     f"控制频率={1.0/self.dt:.1f}Hz")

    # ================================================================
    # 动作空间 & 观测空间
    # ================================================================
    def _set_action_space(self):
        """动作：每步的关节角度增量"""
        bounds = np.array([[-self.MAX_DELTA, self.MAX_DELTA]] * self.nu)
        self.action_space = self.generate_action_space(bounds)

    def _set_obs_space(self):
        self.observation_space = self.generate_observation_space(self._get_obs())

    # ================================================================
    # 观测（教程 4：状态查询）
    # ================================================================
    def _get_obs(self) -> dict:
        """收集观测：关节状态 + 末端位姿 + 目标位置"""
        # 末端执行器位姿（教程 4）
        ee_site = self.site("end_effector")
        sites = self.query_site_pos_and_quat([ee_site])
        ee_pos = sites[ee_site]["xpos"].copy()

        # 到目标的距离
        dist = np.linalg.norm(ee_pos - self._goal_pos)

        return {
            "joint_pos": self.data.qpos[:self.nq].copy(),
            "joint_vel": self.data.qvel[:self.nv].copy(),
            "ee_pos": ee_pos.astype(np.float32),
            "goal_pos": self._goal_pos.astype(np.float32),
            "dist_to_goal": np.array([dist], dtype=np.float32),
        }

    # ================================================================
    # 仿真步进
    # ================================================================
    def step(self, action: np.ndarray):
        """
        执行一步仿真。

        action: 关节角度增量 (nu,)，每个值 ∈ [-MAX_DELTA, MAX_DELTA]
        """
        self._step_count += 1

        # 1. 限制增量幅度
        action = np.clip(action, -self.MAX_DELTA, self.MAX_DELTA)

        # 2. 目标位置 = 当前位置 + 增量
        target_qpos = self.data.qpos[:self.nu] + action

        # 3. PD 控制器 → 力矩 → 仿真步进
        ctrl = self._pd.compute(target_qpos, self.data.qpos, self.data.qvel)
        self.do_simulation(ctrl, self.frame_skip)

        # 4. 获取新观测
        obs = self._get_obs()

        # 5. 计算奖励
        reward, terminated = self._compute_reward(obs, action)

        # 6. 检查截断
        truncated = self._step_count >= 300

        info = {
            "dist": obs["dist_to_goal"].item(),
            "step": self._step_count,
        }

        return obs, reward, terminated, truncated, info

    # ================================================================
    # 奖励函数
    # ================================================================
    def _compute_reward(self, obs, action):
        """
        奖励设计：
        - 距离惩罚（密集）：每步都给，越近越好
        - 成功奖励（稀疏）：到达时给一次大额奖励
        - 动作平滑惩罚：不鼓励剧烈动作
        """
        dist = obs["dist_to_goal"].item()

        # 距离惩罚
        dist_reward = -dist

        # 成功奖励
        reached = dist < self.SUCCESS_THRESHOLD
        success_reward = 50.0 if reached else 0.0

        # 动作平滑惩罚
        action_penalty = -0.01 * np.sum(action ** 2)

        reward = dist_reward + success_reward + action_penalty
        return reward, reached

    # ================================================================
    # 重置
    # ================================================================
    def reset_model(self):
        """重置任务：采样新目标位置"""
        self.ctrl = np.zeros(self.nu, dtype=np.float32)
        self._step_count = 0

        # 在工作空间内随机采样目标位置
        ws = self.GOAL_WORKSPACE
        self._goal_pos = self.np_random.uniform(
            low=ws[:3],
            high=ws[3:],
        )
        _logger.info(f"新目标: {self._goal_pos}")

        return self._get_obs(), {"goal": self._goal_pos.copy()}


# ============================================================
# 注册环境
# ============================================================
ENV_ID = "ReachTargetTask-v1"
if ENV_ID not in gym.envs.registry:
    gym.register(
        id=ENV_ID,
        entry_point="reach_target_task:ReachTargetTask",
        kwargs={
            'frame_skip': 20,
            'orcagym_addr': "localhost:50051",
            'agent_names': ["robot_0"],
            'time_step': 0.001,
        },
        max_episode_steps=300,
    )


# ============================================================
# 手动控制演示（非 RL）
# ============================================================
def manual_control_demo():
    """
    用手写的"朝向目标"策略来控制机械臂。

    策略逻辑非常简单：
    1. 给 PD 控制器一个"朝目标方向"的动作
    2. 如果距离在缩小，继续
    3. 如果距离在增大，换方向

    这展示了如何在不使用 RL 的情况下，用手动规则完成仿真任务。
    """
    print("=" * 60)
    print("  手动控制演示：机械臂到达目标")
    print("=" * 60)

    env = gym.make(ENV_ID)

    # 重置
    obs, info = env.reset()
    goal = info["goal"]
    print(f"\n🎯 目标位置: [{goal[0]:.3f}, {goal[1]:.3f}, {goal[2]:.3f}]")

    # 简单的探索策略：随机尝试 + 如果变好就保留
    total_reward = 0
    best_dist = float("inf")
    best_action = np.zeros(env.nu)

    for step_idx in range(300):
        # 对于非 RL 场景，我们简化：用小的随机探索
        # 在实际应用中，你会用 IK 解算器或人工编写的控制器

        # 简单策略：往末端到目标的方向移动
        ee_pos = obs["ee_pos"]
        direction = goal - ee_pos
        dist = np.linalg.norm(direction)

        if dist < env.SUCCESS_THRESHOLD:
            print(f"\n✅ 到达目标！耗时 {step_idx} 步，误差 {dist*1000:.1f}mm")
            break

        # 构造动作：在目标方向附近随机探索
        if dist < best_dist:
            best_dist = dist
            # 如果变好了，保存当前方向
            best_action = np.random.randn(env.nu) * env.MAX_DELTA * 0.3
        else:
            # 如果变差了，换一个方向（随机探索）
            best_action = np.random.randn(env.nu) * env.MAX_DELTA * 0.5

        action = best_action
        obs, reward, terminated, truncated, info = env.step(action)
        env.render()
        total_reward += reward

        if step_idx % 30 == 0:
            print(f"  Step {step_idx:3d}: dist={dist*1000:5.1f}mm, "
                  f"ee=[{ee_pos[0]:.3f},{ee_pos[1]:.3f},{ee_pos[2]:.3f}], "
                  f"reward={reward:+.3f}")

    if step_idx == 299:
        print(f"\n⏰ 未在 300 步内到达目标，最终误差 {dist*1000:.1f}mm")

    print(f"\n总奖励: {total_reward:.1f}")
    env.close()
    return env


# ============================================================
# 程序化轨迹示例（更智能的方式）
# ============================================================
def trajectory_demo():
    """
    演示：生成一条关节空间的平滑轨迹。

    这种方式比纯随机探索高效得多：
    1. 规划一条从起点到终点的轨迹
    2. PD 控制器追踪这条轨迹

    在实际应用中，你可能会用 IK 解算器来生成末端轨迹，
    但这里我们用简单的关节空间轨迹来演示概念。
    """
    env = gym.make(ENV_ID)
    obs, info = env.reset()
    goal = info["goal"]

    print(f"\n🎯 轨迹追踪演示")
    print(f"   目标: [{goal[0]:.3f}, {goal[1]:.3f}, {goal[2]:.3f}]")

    for step_idx in range(300):
        ee_pos = obs["ee_pos"]
        dist = np.linalg.norm(ee_pos - goal)

        if dist < env.SUCCESS_THRESHOLD:
            print(f"\n✅ 到达目标！耗时 {step_idx} 步")
            break

        # 计算末端到目标的方向
        direction = goal - ee_pos
        direction = direction / (np.linalg.norm(direction) + 1e-6)

        # 简单方法：给每个关节一个与该方向"相关"的动作
        # 这只是一个演示概念——实际应该用 IK
        action = np.zeros(env.nu)
        for j in range(min(3, env.nu)):
            # 前几个关节负责大范围定位
            action[j] = direction[j % 3] * env.MAX_DELTA * 0.5

        obs, reward, terminated, truncated, info = env.step(action)
        env.render()

        if step_idx % 30 == 0:
            print(f"  Step {step_idx:3d}: dist={dist*1000:.1f}mm")

    env.close()


# ============================================================
# 运行
# ============================================================
if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "trajectory":
        trajectory_demo()
    else:
        manual_control_demo()
```

---

## 代码结构回顾

```
ReachTargetTask
│
├── __init__()
│   ├── super().__init__()        ← 连接仿真、初始化 MuJoCo
│   ├── self._goal_pos            ← 任务特有状态
│   ├── self._pd = PDController() ← 底层控制器
│   ├── _set_action_space()       ← 定义动作
│   └── _set_obs_space()          ← 定义观测
│
├── reset_model()
│   ├── 采样新目标位置
│   └── 返回初始观测
│
├── step(action)
│   ├── target = current + action      ← 解析动作
│   ├── ctrl = pd.compute(target, ...) ← PD → 力矩
│   ├── do_simulation(ctrl, ...)       ← 物理仿真
│   ├── obs = _get_obs()               ← 收集观测
│   └── _compute_reward(obs, action)   ← 计算奖励
│
└── _get_obs()
    ├── self.data.qpos / qvel           ← 关节状态 (教程 4)
    ├── query_site_pos_and_quat()       ← 末端位姿 (教程 4)
    └── 计算到目标的距离
```

---

## 运行 & 调试

### 运行手动演示

```bash
python reach_target_task.py
```

### 运行轨迹演示

```bash
python reach_target_task.py trajectory
```

### 添加调试输出

在 `step()` 中插入：

```python
# 每 50 步输出一次完整状态
if self._step_count % 50 == 0:
    print(f"[Step {self._step_count}]")
    print(f"  qpos[:3]: {self.data.qpos[:3]}")
    print(f"  ee_pos:   {obs['ee_pos']}")
    print(f"  goal:     {obs['goal_pos']}")
    print(f"  dist:     {obs['dist_to_goal'].item():.4f}")
```

---

## 你学会了什么

回顾整个新手教程，你掌握了：

| 教程 | 知识点 | 在本任务中的体现 |
|------|--------|-----------------|
| Hello World | 环境注册、`step`/`reset` | `gym.register()`、`gym.make()` |
| 场景搭建 | Actor 摆放、资产添加 | （任务开始前搭建的场景） |
| 第一个环境 | 继承 `OrcaGymLocalEnv` | `class ReachTargetTask(OrcaGymLocalEnv)` |
| 读取状态 | 查询关节/Body/Site | `query_site_pos_and_quat()` |
| 控制关节 | qpos/qvel 操作 | `self.data.qpos[:nu] + action` |
| 相机视觉 | CameraWrapper | （可选的图像观测） |
| PD 控制器 | 目标角度→力矩 | `self._pd.compute()` |
| **本任务** | **组合一切** | **完整的 reach 任务** |

---

## 扩展方向

掌握了基础后，你可以尝试：

1. **加入相机观测** — 在 `_get_obs()` 中添加相机图像
2. **更智能的控制** — 用 IK 解算器替代简单探索（参考 [逆运动学教程](../robot_control/inverse-kinematics.md)）
3. **加入物体操作** — 在场景中放一个方块，让机械臂推动它（参考 [Mocap 控制](../robot_control/mocap-control.md)）
4. **加入传感器** — 读取力传感器，实现力控任务（参考 [传感器教程](../sensing/sensors.md)）

### 进一步阅读

- 物理仿真: [物理仿真教程](../physics/index.md)
- 高级控制: [机器人控制教程](../robot_control/index.md)
- 场景编辑: [场景教程](../scene/index.md)
- 工具链: [工具教程](../tools/index.md)

---

> 🎉 **恭喜！**你已经从零开始，学会了 OrcaGym 的核心使用方式。现在去创造你自己的机器人任务吧！
