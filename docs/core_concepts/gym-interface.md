# 🏋️ Gymnasium 接口

OrcaGym 严格遵循 Gymnasium 规范，提供标准的 RL 环境接口。

## 环境基类层次

```
gymnasium.Env
  │
  ├── OrcaGymEulerEnv + OrcaGymEnvMixin  (新主路径 ✅ 推荐)
  │     └── 各种任务环境 (用户自定义)
  │
  └── OrcaGymBaseEnv                     (老体系基类)
        ├── OrcaGymLocalEnv              (老体系本地环境)
        │     └── 各种任务环境 (用户自定义)
        └── OrcaGymRemoteEnv             (老体系远程环境)
```

## OrcaGymEulerEnv（推荐）

Euler 环境 Facade，直接继承 `gym.Env` + `OrcaGymEnvMixin`，组合 `OrcaGymEuler` 仿真核心。

### 构造参数

```python
class OrcaGymEulerEnv(OrcaGymEnvMixin, gym.Env):
    def __init__(
        self,
        frame_skip: int,           # 每个 step() 对应的物理步数
        orcagym_addr: str,         # gRPC 服务地址 (如 "localhost:50051")
        agent_names: list[str],    # 智能体名称列表
        time_step: float,          # 物理时间步长 (秒)
        *,
        model_xml_path: str | None = None,   # 本地 XML 路径（离线模式）
        skip_grpc_load: bool = False,        # True → 离线模式
        render_mode: str = "human",          # "human" / "none"
        sync_render: bool = False,
        **kwargs
    ):
```

> **注意**：`OrcaGymEulerEnv.__init__` 自主编排生命周期，不调用 `super().__init__()`。

### 必须实现的抽象方法

每个子类必须重写：

```python
def step(self, action) -> Tuple[Obs, float, bool, bool, dict]:
    """执行一步仿真，返回 obs, reward, terminated, truncated, info"""

def reset_model(self) -> tuple[dict, dict]:
    """重置机器人状态到初始位姿"""

def _get_obs(self) -> dict:
    """构建观测"""
```

### 工具方法（来自 OrcaGymEnvMixin）

```python
# 生成动作空间
action_space = self.generate_action_space(ctrl_range_bounds)

# 生成观测空间
obs_space = self.generate_observation_space(sample_obs)

# 多智能体名称工具
body_name = self.body("torso", agent_id=0)          # "agent0_torso"
joint_name = self.joint("hip", agent_id=0)          # "agent0_hip"
actuator_name = self.actuator("hip_actuator", agent_id=0)
```

### 关键属性

```python
# 状态与配置
env.data          # OrcaGymDataView — 完整状态只读视图
env.model         # OrcaGymModel — 模型结构
env.sim_config    # SimConfig — 求解器配置
env.ctrl          # np.ndarray — 当前控制输入

@property
def dt(self):
    """每个 step() 对应的秒数"""
    return self.sim_config.timestep * self.frame_skip
```

> ⚠️ **注意**：Euler 体系中 `env.gym` / `env.stub` / `env.channel` **不存在**（Python 原生 `AttributeError`）。

### 初始化流程

```python
class OrcaGymEulerEnv(OrcaGymEnvMixin, gym.Env):
    def __init__(self, ...):
        # 基础字段
        self._agent_names = agent_names
        self.frame_skip = frame_skip
        # ... 生命周期自主编排
        self.initialize_grpc()        # 创建 _gym/_stub/_channel
        self.pause_simulation()
        self.set_time_step(time_step)
        self.initialize_simulation()  # 加载模型 → 返回 (model, data)
        self.reset_simulation()
        self.init_qpos_qvel()
```

### reset() 流程

```
env.reset() [来自 OrcaGymEnvMixin]
  ├── super().reset(seed=seed)   # → gym.Env.reset
  ├── reset_simulation()         # reset_data + sync_to_view
  ├── reset_model()              # 子类：设置关节初始位姿
  └── render()                   # 刷新可视化
```

## OrcaGymLocalEnv（老体系）

> ⚠️ 老体系环境，维护模式。新项目推荐使用 `OrcaGymEulerEnv`。

```python
class OrcaGymLocalEnv(OrcaGymBaseEnv):
    def __init__(self, frame_skip, orcagym_addr, agent_names, time_step, **kwargs):
        super().__init__(...)
        # 1. initialize_grpc()     → 创建 gRPC channel + stub + OrcaGymLocal
        # 2. pause_simulation()    → 暂停服务端仿真循环
        # 3. initialize_simulation() → 加载 XML, 创建 MuJoCo 模型
        # 4. reset_simulation()    → 重置到初始状态
        # 5. init_qpos_qvel()      → 缓存初始状态
```

### 关键属性

```python
env.gym           # OrcaGymLocal — backend 实例（公共属性）
env.model         # OrcaGymModel
env.data          # OrcaGymData（仅 5 字段）

@property
def dt(self):
    return self.gym.opt.timestep * self.frame_skip
```

## 观测与动作空间

### 动作空间

OrcaGym 自动从 MuJoCo 执行器控制范围生成 `action_space`：

```python
# 内部实现
ctrl_range = self.model.get_actuator_ctrlrange()  # (nu, 2)
self.action_space = self.generate_action_space(ctrl_range)
# 等价于: spaces.Box(low=ctrl_range[:, 0], high=ctrl_range[:, 1])
```

### 观测空间

观测空间由子类在 `_get_obs()` 中定义：

```python
def _get_obs(self):
    """构建观测，返回 np.ndarray 或 dict"""
    # 示例：拼接 qpos + qvel
    obs = np.concatenate([self.data.qpos, self.data.qvel])
    return obs.astype(np.float32)

# 首次 reset 时自动推断观测空间
```

### 支持的空间类型

| 类型 | Python 类 | 说明 |
|------|-----------|------|
| Box 连续空间 | `spaces.Box` | 观测/动作是 numpy 数组 |
| Dict 字典空间 | `spaces.Dict` | 观测是字典（多模态） |
| Discrete 离散空间 | `spaces.Discrete` | 离散动作 |

## 创建环境

### 直接实例化（Euler 推荐方式）

```python
from orca_gym.environment.euler.orca_gym_euler_env import OrcaGymEulerEnv

class MyTaskEnv(OrcaGymEulerEnv):
    ...

env = MyTaskEnv(
    frame_skip=20,
    orcagym_addr="localhost:50051",
    agent_names=["agent0"],
    time_step=0.001,
)
```

### 通过 gym.make

```python
import gymnasium as gym

env = gym.make(
    "YourTaskEnv-v0",
    frame_skip=20,
    orcagym_addr="localhost:50051",
    agent_names=["agent0"],
    time_step=0.001,
    render_mode="none",
)
```

### 通过注册

```python
gym.register(
    id="MyTask-v0",
    entry_point="my_package:MyTaskEnv",
    kwargs={"additional_param": 42},
    max_episode_steps=1000,
)
env = gym.make("MyTask-v0", **specific_kwargs)
```

## 关键约定

1. **`env.dt`** 是策略控制周期，不是 MuJoCo 的 `timestep`
2. **`frame_skip`** 决定一个 step 内执行多少次物理步
3. **观测应在 `_get_obs()` 中构建**，内部调用 `env.do_simulation()` 后数据已更新
4. **多智能体时**，body/joint/actuator 的名称会自动加 agent 前缀（通过 Mixin 中 `self.body()` 等方法）
5. **Euler 体系**中 `env.do_simulation()` 返回后 `env.data` 已自动同步（无需手动 `update_data()`）
6. **Euler 体系**中 `env.gym` 不存在，状态配置通过 `env.sim_config` 访问
