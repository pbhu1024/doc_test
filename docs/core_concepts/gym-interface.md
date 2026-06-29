# 🏋️ Gymnasium 接口

OrcaGym 严格遵循 Gymnasium 规范，提供标准的 RL 环境接口。

## 环境基类层次

```
gymnasium.Env
  └── OrcaGymBaseEnv          (orca_gym/environment/orca_gym_env.py)
        ├── OrcaGymLocalEnv    (orca_gym/environment/orca_gym_local_env.py)
        │     └── 各种任务环境 (用户自定义)
        └── OrcaGymRemoteEnv   (orca_gym/environment/orca_gym_remote_env.py)
```

## OrcaGymBaseEnv

所有 OrcaGym 环境的共同基类。

### 构造参数

```python
class OrcaGymBaseEnv(gym.Env):
    def __init__(
        self,
        frame_skip: int,           # 每个 step() 对应的物理步数
        orcagym_addr: str,         # gRPC 服务地址 (如 "localhost:50051")
        agent_names: list[str],    # 智能体名称列表
        time_step: float,          # 物理时间步长 (秒)
        **kwargs                   # 额外参数
    ):
```

### 必须实现的抽象方法

每个子类必须重写：

```python
def step(self, action) -> Tuple[Obs, float, bool, bool, dict]:
    """执行一步仿真，返回 obs, reward, terminated, truncated, info"""

def reset_model(self) -> tuple[dict, dict]:
    """重置机器人状态到初始位姿"""

def initialize_simulation(self) -> Tuple[OrcaGymModel, OrcaGymData]:
    """初始化 MuJoCo 仿真"""

def _step_orca_sim_simulation(self, ctrl, n_frames):
    """推进仿真"""

def render(self):
    """渲染当前帧"""
```

### 工具方法

```python
# 生成动作空间（根据执行器控制范围）
action_space = self.generate_action_space(ctrl_range_bounds)

# 生成观测空间（根据示例观测自动推断）
obs_space = self.generate_observation_space(sample_obs)

# 多智能体名称工具
body_name = self.body("torso", agent_id=0)          # "agent0:torso"
joint_name = self.joint("hip", agent_id=0)          # "agent0:hip"
actuator_name = self.actuator("hip_actuator", agent_id=0)
```

### 关键属性

```python
@property
def dt(self):
    """每个 step() 对应的秒数 = timestep * frame_skip"""
    return self.gym.opt.timestep * self.frame_skip
```

## OrcaGymLocalEnv

本地环境的实现，将 `OrcaGymLocal` 绑定为 `self.gym`。

### 初始化流程

```python
class OrcaGymLocalEnv(OrcaGymBaseEnv):
    def __init__(self, ...):
        super().__init__(...)
        # 1. initialize_grpc()     → 创建 gRPC channel + stub
        # 2. pause_simulation()    → 暂停服务端仿真循环
        # 3. initialize_simulation() → 加载 XML, 创建 MuJoCo 模型
        # 4. reset_simulation()    → 重置到初始状态
        # 5. init_qpos_qvel()      → 缓存初始状态
        # 6. mj_forward()          → 确保派生量一致
```

### reset() 流程

```
env.reset()
  ├── reset_simulation()     # load_initial_frame + update_data
  ├── reset_model()          # 子类：设置关节初始位姿
  └── render()               # 刷新可视化
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
# 使用 generate_observation_space(obs) 创建 spaces.Box 或 spaces.Dict
```

### 支持的空间类型

| 类型 | Python 类 | 说明 |
|------|-----------|------|
| Box 连续空间 | `spaces.Box` | 观测/动作是 numpy 数组 |
| Dict 字典空间 | `spaces.Dict` | 观测是字典（多模态） |
| Discrete 离散空间 | `spaces.Discrete` | 离散动作 |

## 创建环境

### 通过 gym.make

```python
import gymnasium as gym

# 需要环境中已注册的 env_id
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

### 直接实例化

```python
from my_package import MyTaskEnv

env = MyTaskEnv(
    frame_skip=20,
    orcagym_addr="localhost:50051",
    agent_names=["agent0"],
    time_step=0.001,
)
```

## 关键约定

1. **`env.dt`** 是策略控制周期，不是 MuJoCo 的 `timestep`
2. **`frame_skip`** 决定一个 step 内执行多少次物理步
3. **观测应在 `_get_obs()` 中构建**，内部调用 `env.do_simulation()` 后数据已更新
4. **多智能体时**，body/joint/actuator 的名称会自动加 agent 前缀
