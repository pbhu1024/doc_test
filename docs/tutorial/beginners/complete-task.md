# 🏆 完整任务 — 从零构建一个 RL 任务

本篇是新手教程的收官之作。我们将整合前面学到的所有知识，从零构建一个完整的强化学习任务：

> **任务**：控制机械臂末端执行器到达随机目标点（Reach Target）

---

## 任务设计

### 任务描述

- **目标**：控制机械臂使末端执行器（end-effector）移动到随机采样的目标位置
- **动作**：增量关节位置控制（每个关节每步最多变化 0.05 弧度）
- **观测**：关节位置、速度、末端位姿、目标位置
- **奖励**：到达目标给正奖励 + 距离惩罚 + 能耗惩罚
- **终止**：到达目标（`terminated`）或超时（`truncated`）

### 奖励函数设计

好的奖励函数是 RL 成功的关键。我们采用**密集奖励 + 成功奖励**的组合：

```python
# 1. 距离奖励（密集）：每步都给予，引导靠近目标
dist_reward = -distance_to_goal

# 2. 成功奖励（稀疏）：到达目标时给大额奖励
success_reward = 100.0 if distance < threshold else 0.0

# 3. 能耗惩罚（正则化）：惩罚过大的动作
action_penalty = -0.01 * np.sum(action ** 2)

# 总奖励
reward = dist_reward + success_reward + action_penalty
```

---

## 完整代码

```python
"""
reach_target_env.py — 机械臂到达目标任务的完整环境

这个环境实现了：
- 随机目标采样
- 增量关节位置控制（PD 控制器）
- 密集奖励 + 成功奖励
- 完整的观测空间
- 环境注册

可以直接用于 Stable-Baselines3、RLlib 等 RL 框架训练。
"""

import numpy as np
from typing import Optional
import gymnasium as gym
from gymnasium import spaces

from orca_gym.environment.orca_gym_local_env import OrcaGymLocalEnv
from orca_gym.log.orca_log import get_orca_logger

_logger = get_orca_logger()


# ================================================================
# PD 控制器（内嵌在环境类中）
# ================================================================
class PDController:
    """简单的多关节 PD 控制器"""

    def __init__(self, nu: int, kp: float = 150.0, kd: float = 15.0):
        self.nu = nu
        self.kp = np.full(nu, kp, dtype=np.float64)
        self.kd = np.full(nu, kd, dtype=np.float64)

    def compute(self, target_qpos, current_qpos, current_qvel):
        """计算 PD 力矩"""
        pos_error = target_qpos - current_qpos[:self.nu]
        vel_error = np.zeros(self.nu) - current_qvel[:self.nu]
        return (self.kp * pos_error + self.kd * vel_error).astype(np.float64)


# ================================================================
# 主环境类
# ================================================================
class ReachTargetEnv(OrcaGymLocalEnv):
    """
    机械臂末端到达目标点任务。

    ## 动作空间
        Box(low=-0.05, high=0.05, shape=(nu,))
        每步的关节角度增量（弧度）

    ## 观测空间
        Dict(
            joint_pos:     Box(shape=(nq,))      — 关节位置
            joint_vel:     Box(shape=(nv,))      — 关节速度
            ee_pos:        Box(shape=(3,))       — 末端执行器位置
            goal_pos:      Box(shape=(3,))       — 目标位置
            dist_to_goal:  Box(shape=(1,))       — 到目标的距离
        )

    ## 奖励
        reward = -dist_to_goal           # 距离惩罚（密集）
                 + success_bonus         # 到达奖励（稀疏）
                 - action_penalty        # 动作惩罚（正则化）

    ## 终止条件
        - 到达目标：dist_to_goal < 1cm  →  terminated = True
        - 超时：由 TimeLimit wrapper 自动处理 → truncated = True
    """

    # ---------------------------------------------------------------
    # 任务超参数（集中管理，方便调参）
    # ---------------------------------------------------------------
    SUCCESS_THRESHOLD = 0.01     # 到达目标的距离阈值（米），1cm
    SUCCESS_BONUS = 100.0        # 到达目标的奖励
    ACTION_PENALTY_COEF = 0.01   # 动作惩罚系数
    MAX_DELTA_PER_STEP = 0.05    # 每步最大关节角度变化（弧度）
    PD_KP = 150.0                # PD 比例增益
    PD_KD = 15.0                 # PD 微分增益

    # 目标采样空间 [x_min, y_min, z_min, x_max, y_max, z_max]
    GOAL_WORKSPACE = np.array([0.2, -0.3, 0.1, 0.6, 0.3, 0.5])

    def __init__(
        self,
        frame_skip: int,
        orcagym_addr: str,
        agent_names: list[str],
        time_step: float,
        max_episode_steps: Optional[int] = 200,  # 每 episode 最大步数
        **kwargs,
    ):
        # ---- 父类初始化 ----
        super().__init__(
            frame_skip=frame_skip,
            orcagym_addr=orcagym_addr,
            agent_names=agent_names,
            time_step=time_step,
            **kwargs,
        )

        # ---- 保存维度 ----
        self.nq = self.model.nq
        self.nv = self.model.nv
        self.nu = self.model.nu

        # ---- 任务状态 ----
        self._goal_pos = np.zeros(3)          # 当前目标位置
        self._step_count = 0                  # 当前 episode 步数
        self._max_episode_steps = max_episode_steps  # 最大步数

        # ---- 创建 PD 控制器 ----
        self._pd = PDController(
            nu=self.nu,
            kp=self.PD_KP,
            kd=self.PD_KD,
        )

        # ---- 初始化动作和观测空间 ----
        self._set_action_space()
        self._set_obs_space()

        _logger.info(
            f"ReachTargetEnv 初始化完成: "
            f"nq={self.nq}, nv={self.nv}, nu={self.nu}, "
            f"控制频率={1.0/self.dt:.1f}Hz"
        )

    # ---------------------------------------------------------------
    # 动作空间
    # ---------------------------------------------------------------
    def _set_action_space(self):
        """
        动作空间：增量关节位置控制

        每个动作分量 ∈ [-0.05, 0.05] 弧度，表示该关节本步的目标变化量。
        实际目标 = 当前位置 + 动作增量（截断到关节限位内）
        """
        if self.nu > 0:
            bounds = np.array(
                [[-self.MAX_DELTA_PER_STEP, self.MAX_DELTA_PER_STEP]] * self.nu
            )
            self.action_space = self.generate_action_space(bounds)
        else:
            _logger.warning("nu 为 0，动作空间为空！")
            self.action_space = spaces.Box(
                low=np.array([]), high=np.array([]), dtype=np.float32
            )

    # ---------------------------------------------------------------
    # 观测空间
    # ---------------------------------------------------------------
    def _set_obs_space(self):
        sample_obs = self._get_obs()
        self.observation_space = self.generate_observation_space(sample_obs)

    # ---------------------------------------------------------------
    # 获取观测
    # ---------------------------------------------------------------
    def _get_obs(self) -> dict:
        """
        收集当前状态作为观测。

        所有值都做 copy() 以防止被后续仿真步进覆盖。
        """
        # 末端执行器位姿
        ee_site = self.site("end_effector")
        sites = self.query_site_pos_and_quat([ee_site])
        ee_pos = sites[ee_site]["xpos"].copy()

        # 到目标的欧氏距离
        dist = np.linalg.norm(ee_pos - self._goal_pos)

        obs = {
            # 关节状态
            "joint_pos": self.data.qpos[:self.nq].copy(),
            "joint_vel": self.data.qvel[:self.nv].copy(),

            # 末端执行器
            "ee_pos": ee_pos.astype(np.float32),

            # 目标
            "goal_pos": self._goal_pos.astype(np.float32),

            # 辅助信息（帮助策略感知进度）
            "dist_to_goal": np.array([dist], dtype=np.float32),
        }

        return obs

    # ---------------------------------------------------------------
    # 仿真步进
    # ---------------------------------------------------------------
    def step(self, action: np.ndarray):
        """
        执行一步仿真。

        Args:
            action: 关节增量，形状 (nu,)，每个值 ∈ [-MAX_DELTA, MAX_DELTA]

        Returns:
            标准的 Gymnasium 5 元组
        """
        self._step_count += 1

        # ---- 1. 解析动作：clip 到合法范围 ----
        action = np.clip(action, -self.MAX_DELTA_PER_STEP, self.MAX_DELTA_PER_STEP)

        # ---- 2. 计算目标关节位置 = 当前位置 + 增量 ----
        current_qpos = self.data.qpos[:self.nu].copy()
        target_qpos = current_qpos + action

        # ---- 3. 通过 PD 控制器将目标位置转为力矩 ----
        ctrl = self._pd.compute(
            target_qpos=target_qpos,
            current_qpos=self.data.qpos,
            current_qvel=self.data.qvel,
        )

        # ---- 4. 执行仿真步进 ----
        self.do_simulation(ctrl, self.frame_skip)

        # ---- 5. 获取新观测 ----
        obs = self._get_obs()

        # ---- 6. 计算奖励 ----
        reward, terminated, info = self._compute_reward(obs, action)

        # ---- 7. 截断判断 ----
        truncated = self._step_count >= self._max_episode_steps

        # 可选：在 info 中加入调试信息
        info["step"] = self._step_count
        info["ctrl_norm"] = float(np.linalg.norm(ctrl))

        return obs, reward, terminated, truncated, info

    # ---------------------------------------------------------------
    # 奖励函数
    # ---------------------------------------------------------------
    def _compute_reward(self, obs: dict, action: np.ndarray):
        """
        计算奖励和终止条件。

        奖励由三部分组成：
        1. 距离奖励（密集）：每一步都给予，引导靠近目标
        2. 成功奖励（稀疏）：到达目标时一次性大额奖励
        3. 动作惩罚（正则化）：惩罚过大的动作，鼓励节能

        Returns:
            reward: 总奖励
            terminated: 是否成功到达目标
            info: 附加信息
        """
        dist = obs["dist_to_goal"].item()

        # ---- 距离惩罚（密集奖励）----
        # 负的距离作为每步的基础奖励
        # 距离越近，惩罚越小（奖励越大）
        dist_reward = -dist

        # ---- 成功奖励 ----
        terminated = dist < self.SUCCESS_THRESHOLD
        success_reward = self.SUCCESS_BONUS if terminated else 0.0

        # ---- 动作惩罚 ----
        # 惩罚大动作，鼓励策略输出平滑、节能的动作
        action_penalty = -self.ACTION_PENALTY_COEF * np.sum(action ** 2)

        # ---- 总奖励 ----
        reward = dist_reward + success_reward + action_penalty

        info = {
            "dist_to_goal": dist,
            "dist_reward": dist_reward,
            "success_reward": success_reward,
            "action_penalty": action_penalty,
        }

        return reward, terminated, info

    # ---------------------------------------------------------------
    # 重置模型
    # ---------------------------------------------------------------
    def reset_model(self) -> tuple:
        """
        重置任务状态。

        1. 清零控制信号
        2. 随机采样新目标
        3. 重置步数计数器
        4. 返回初始观测
        """
        # 清零控制
        self.ctrl = np.zeros(self.nu, dtype=np.float32)

        # 随机采样新目标 —— 在工作空间内均匀采样
        ws = self.GOAL_WORKSPACE
        self._goal_pos = self.np_random.uniform(
            low=ws[:3],    # [x_min, y_min, z_min]
            high=ws[3:],   # [x_max, y_max, z_max]
        )

        # 重置步数计数
        self._step_count = 0

        # 可选：添加噪声到初始关节位置，增加多样性
        # noise = self.np_random.uniform(-0.01, 0.01, size=self.nu)
        # self.set_joint_qpos(self.init_qpos[:self.nu] + noise)
        # self.mj_forward()

        _logger.debug(f"新目标: {self._goal_pos}")

        obs = self._get_obs()
        info = {"goal": self._goal_pos.copy()}

        return obs, info


# ================================================================
# 注册环境
# ================================================================
# 将环境注册到 Gymnasium，使其可以通过 gym.make() 创建

ENV_ID = "ReachTarget-v0"

# 检查是否已经注册过（避免重复注册报错）
if ENV_ID not in gym.envs.registry:
    gym.register(
        id=ENV_ID,
        entry_point="reach_target_env:ReachTargetEnv",
        kwargs={
            'frame_skip': 20,
            'orcagym_addr': "localhost:50051",
            'agent_names': ["robot_0"],
            'time_step': 0.001,
            'max_episode_steps': 200,
        },
        max_episode_steps=200,
    )
```

---

## 使用环境

### 1. 交互式测试

```python
"""
test_reach_env.py — 用手动/随机动作测试环境
"""

import gymnasium as gym
import numpy as np

# 创建环境
env = gym.make("ReachTarget-v0")

# 重置
obs, info = env.reset()
print(f"初始目标位置: {info['goal']}")
print(f"观测空间: {env.observation_space}")
print(f"动作空间: {env.action_space}")

# 运行一个 episode
total_reward = 0.0
for step_idx in range(200):
    # 用随机动作测试（实际训练时替换为策略输出）
    action = env.action_space.sample()

    obs, reward, terminated, truncated, info = env.step(action)
    env.render()
    total_reward += reward

    if step_idx % 20 == 0:
        print(f"  Step {step_idx:3d}: "
              f"reward={reward:8.4f}, "
              f"dist={info['dist_to_goal']:.4f}, "
              f"ctrl_norm={info['ctrl_norm']:.2f}")

    if terminated:
        print(f"  ✅ 到达目标！在第 {step_idx} 步")
        break

    if truncated:
        print(f"  ⏰ 超时截断，最终距离: {info['dist_to_goal']:.4f}")
        break

print(f"\nEpisode 总奖励: {total_reward:.2f}")
env.close()
```

### 2. 与 Stable-Baselines3 集成

```python
"""
train_reach.py — 使用 Stable-Baselines3 训练到达任务

需要安装: pip install stable-baselines3 torch
"""

import gymnasium as gym
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import EvalCallback
from stable_baselines3.common.monitor import Monitor

# 确保环境已注册
import reach_target_env  # 这会触发 gym.register()

# 创建训练环境（带 Monitor 包装以记录统计信息）
env = gym.make("ReachTarget-v0")
env = Monitor(env)

# 创建评估环境
eval_env = gym.make("ReachTarget-v0")
eval_env = Monitor(eval_env)

# 创建 PPO 策略
model = PPO(
    policy="MultiInputPolicy",  # 因为观测是 Dict，需要使用 MultiInputPolicy
    env=env,
    learning_rate=3e-4,
    n_steps=2048,
    batch_size=64,
    n_epochs=10,
    gamma=0.99,
    gae_lambda=0.95,
    clip_range=0.2,
    verbose=1,
    tensorboard_log="./logs/",
)

# 创建评估回调
eval_callback = EvalCallback(
    eval_env,
    best_model_save_path="./logs/best_model/",
    log_path="./logs/eval/",
    eval_freq=5000,
    deterministic=True,
    render=False,
)

# 开始训练
print("🚀 开始训练...")
model.learn(
    total_timesteps=1_000_000,
    callback=eval_callback,
    progress_bar=True,
)

# 保存模型
model.save("reach_target_ppo")
print("✅ 训练完成！模型已保存到 reach_target_ppo.zip")

env.close()
eval_env.close()
```

---

## 调优指南

### 奖励函数调优

奖励函数设计是 RL 中最需要实验的部分。以下是一些常见问题和解决方案：

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 策略不动（零动作） | 距离惩罚太大，任何探索都更差 | 减少距离惩罚系数，增大成功奖励 |
| 策略剧烈振荡 | 动作惩罚太小 | 增大 `ACTION_PENALTY_COEF` |
| 策略永远到不了目标 | 成功奖励不够大 | 增大 `SUCCESS_BONUS`，或增加中间奖励 |
| 训练不稳定 | 奖励尺度太大 | 对奖励做归一化或剪切 |
| 学到局部最优（在目标附近徘徊但不抵达） | 距离奖励和成功奖励不协调 | 增加成功阈值附近的额外奖励 |

### 奖励尺度参考

```python
# 推荐的奖励尺度范围
dist_reward ∈ [-1, 0]       # 距离惩罚（占主导）
success_reward ∈ [10, 100]  # 成功奖励（一次性）
action_penalty ∈ [-0.1, 0]  # 动作惩罚（小量）
```

### 超参数调优顺序

```python
# 推荐的调优顺序：
# 1. 先确保 PD 参数合理（手动测试）
# 2. 调 SUCCESS_THRESHOLD（根据你的精度需求）
# 3. 调 SUCCESS_BONUS（确保成功时总奖励为正值）
# 4. 调 ACTION_PENALTY_COEF（控制动作平滑度）
# 5. 最后调 RL 算法的超参（learning_rate, batch_size 等）
```

---

## 扩展任务

掌握了到达任务后，你可以尝试以下扩展：

### 1. 推物任务（Push）

```python
class PushEnv(ReachTargetEnv):
    """机械臂推动方块到目标位置"""

    def __init__(self, ...):
        super().__init__(...)
        # 添加方块 object，观测中加入方块位置
        self._object_name = "push_cube"

    def _get_obs(self):
        obs = super()._get_obs()
        # 加入方块位置
        obj_pos, _, _ = self.get_body_xpos_xmat_xquat([self._object_name])
        obs["object_pos"] = obj_pos[:3].astype(np.float32)
        return obs

    def _compute_reward(self, obs, action):
        # 奖励 = 方块到目标的距离
        obj_dist = np.linalg.norm(obs["object_pos"] - self._goal_pos)
        # ...
```

### 2. 拾放任务（Pick and Place）

```python
class PickAndPlaceEnv(ReachTargetEnv):
    """机械臂抓取物体并放到目标位置"""

    def __init__(self, ...):
        super().__init__(...)
        self._grasped = False  # 是否已抓取
        self._pick_target = np.zeros(3)   # 抓取点
        self._place_target = np.zeros(3)  # 放置点

    def _get_obs(self):
        obs = super()._get_obs()
        obs["grasped"] = np.array([float(self._grasped)])
        return obs

    def _compute_reward(self, obs, action):
        # 分阶段奖励：
        # 阶段 1: 到达抓取点
        # 阶段 2: 抓取物体
        # 阶段 3: 移动到放置点
        # 阶段 4: 释放物体
        # ...
```

---

## 回顾与总结

恭喜你完成了新手教程的全部内容！让我们回顾一下你学到的知识：

| 教程 | 核心知识点 |
|------|-----------|
| [🚀 Hello World](hello-world.md) | 环境注册、`gym.make()`、`step()`/`reset()`/`render()` |
| [🏗️ 第一个环境](your-first-env.md) | 继承 `OrcaGymLocalEnv`、实现 `_get_obs()`、环境生命周期 |
| [👁️ 观测与动作](observation-action.md) | 观测空间设计、动作空间类型、归一化策略 |
| [🎮 简单控制器](simple-controller.md) | PD 控制器原理与实现、IK 控制器使用 |
| [🏆 完整任务](complete-task.md) | 奖励函数设计、终止条件、与 SB3 集成训练 |

### 进一步学习

- **物理仿真** → [物理仿真教程](../physics/index.md)
- **传感器使用** → [感知教程](../sensing/index.md)
- **场景编辑** → [场景教程](../scene/index.md)
- **RL 训练工具** → [工具教程](../tools/index.md)
- **API 参考** → [API 参考](../../api_reference/index.md)

### 常见问题

- **仿真速度太慢？** 增大 `frame_skip`，减少渲染频率
- **训练不收敛？** 检查奖励尺度、调整超参数、简化任务
- **内存占用太大？** 使用向量化环境时注意 batch size
- **连接问题？** 参考 [安装指南](../../getting-started/installation.md) 的问题排查

---

> 🎉 **恭喜！**你已经具备了使用 OrcaGym 构建自定义 RL 环境的能力。现在去创造你自己的机器人任务吧！
