# 🌍 Environment API

Gymnasium 环境接口，位于 `orca_gym/environment/`。提供标准的强化学习环境抽象。

## 环境类型

| 类 | 位置 | 状态 | 说明 |
|----|------|------|------|
| **`OrcaGymEulerEnv`** | `environment/euler/orca_gym_euler_env.py` | ✅ **推荐** | Euler 环境 Facade（新主路径） |
| `OrcaGymEnvMixin` | `environment/orca_gym_env_mixin.py` | ✅ 共用 | 名称空间、空间生成、reset 编排 Mixin |
| `OrcaGymLocalEnv` | `environment/orca_gym_local_env.py` | 维护模式 | 本地 MuJoCo 环境（老路径） |
| `OrcaGymBaseEnv` | `environment/orca_gym_env.py` | 维护模式 | 老体系抽象基类 |
| `OrcaGymRemoteEnv` | `environment/orca_gym_remote_env.py` | 维护模式 | 远程 gRPC 驱动环境 |
| `OrcaGymAsyncEnv` | `environment/async_env/` | 维护模式 | 异步并行环境 |
| `OrcaGymVectorEnv` | `environment/async_env/` | 维护模式 | 向量化并行环境 |

## 两套体系对比

| 维度 | Euler 体系（新） | Local 体系（老） |
|------|-----------------|-----------------|
| 环境类 | `OrcaGymEulerEnv` | `OrcaGymLocalEnv` |
| 继承 | `OrcaGymEnvMixin, gym.Env` | `OrcaGymBaseEnv` |
| Backend | `_gym: OrcaGymEuler`（内部，不暴露） | `gym: OrcaGymLocal`（公共属性） |
| 状态视图 | `data: OrcaGymDataView`（完整只读） | `data: OrcaGymData`（仅 5 字段） |
| 求解器配置 | `sim_config: SimConfig`（typed） | `gym.opt: OrcaGymOptConfig`（快照） |
| 外力注入 | `apply_body_force(name, f, tau)` | 直接写 `_mjData.xfrc_applied` |
| `env.gym` 可用？ | ❌ 不存在（`AttributeError`） | ✅ 存在 |
| `env._mjData` 可用？ | ❌ 多层封装隔离 | ⚠️ 可绕道访问（不推荐） |

---

## OrcaGymEulerEnv（Euler 环境 Facade，推荐）

位于 `orca_gym/environment/euler/orca_gym_euler_env.py`。**推荐的新入口**。直接继承 `gym.Env` + `OrcaGymEnvMixin`，组合 `OrcaGymEuler` 仿真核心，向用户代码暴露统一 API。

### 设计契约

```
┌─────────────────────────────────────────────────────────────┐
│  使用契约：用户不应直接访问 _gym/_stub/_channel/_mjData 或  │
│  任何内部 MuJoCo 对象。                                      │
│  读取状态 → 使用 env.data（OrcaGymDataView）                │
│  写入外力 → 使用 env.apply_body_force()                     │
│  仿真步进 → 使用 env.do_simulation(ctrl, n_frames)          │
│  求解器配置 → 使用 env.sim_config.timestep = 0.002          │
│  缺少功能时 → 扩展本类的公共方法，不要直接访问内部对象。    │
└─────────────────────────────────────────────────────────────┘
```

### 构造参数

```python
class OrcaGymEulerEnv(OrcaGymEnvMixin, gym.Env):
    def __init__(
        self,
        frame_skip: int,           # 每次 step() 对应的物理仿真步数
        orcagym_addr: str,         # gRPC 服务端地址（如 "localhost:50051"）
        agent_names: list[str],    # 智能体名称列表
        time_step: float,          # 物理仿真时间步长（秒）
        *,
        model_xml_path: str | None = None,   # 本地 XML 路径（离线模式）
        skip_grpc_load: bool = False,        # True → 离线模式，跳过 gRPC
        render_mode: str = "human",          # "human" / "none"
        sync_render: bool = False,           # 是否同步渲染
        **kwargs,
    )
```

> **注意**：`OrcaGymEulerEnv.__init__` 自主编排生命周期，不调用 `super().__init__()`。

### 公共属性

```python
data: OrcaGymDataView          # 完整状态只读视图（替代 _mjData 读取）
model: OrcaGymModel            # 模型结构信息（原样复用）
sim_config: SimConfig          # 求解器参数配置（替代 opt.* 直接访问）
ctrl: np.ndarray               # 当前控制输入数组
frame_skip: int                # step() 对应的物理步数
orcagym_addr: str              # gRPC 服务端地址
seed: int                      # 随机种子
loop: asyncio.AbstractEventLoop  # 异步事件循环

@property dt: float            # 环境时间步长 = sim_config.timestep × frame_skip
```

> **关键设计**：`env.gym` / `env.stub` / `env.channel` **不存在**（Python 原生 `AttributeError`）——这是封装隔离机制 M0。内部组件通过 `_gym`/`_stub`/`_channel`（下划线前缀）持有，外部不应访问。

### 仿真控制

```python
def do_simulation(ctrl: np.ndarray, n_frames: int) -> None
```
标准仿真步进入口（含 Euler 耦合，当前阶段等价于纯 MuJoCo）。检查控制维度 → 设置控制 → 步进 n_frames → 同步状态。**是 `step()` 的核心实现方法**。

契约：
- 调用后 `self.data` 保证一致（已同步到最新状态）
- ctrl 形状必须为 `(nu,)`，不匹配抛 `ValueError`

```python
def mj_step(nstep: int) -> None
```
纯 MuJoCo 步进（无 Euler 耦合）。委托 `self._gym.mj_step()`。

```python
def mj_forward() -> None
```
前向计算（不步进，仅更新派生量）。在修改状态后需调用以更新 body/site 位姿、传感器等。

```python
def set_ctrl(ctrl: np.ndarray) -> None
```
设置控制输入。委托 `self._gym.set_ctrl()`。

### 状态访问

```python
@property
def data(self) -> OrcaGymDataView
```
返回 MuJoCo 状态只读视图。基本字段（qpos/qvel/qacc 等）为零拷贝视图。Body/site 查询按名称进行。

```python
@property
def model(self) -> OrcaGymModel
```
返回模型结构抽象。提供名称↔ID 映射、维度信息等。

```python
@property
def sim_config(self) -> SimConfig
```
返回求解器参数配置（替代直接访问 `_mjModel.opt.*`）。

```python
@property
def dt(self) -> float
```
环境时间步长 = `sim_config.timestep × frame_skip`。通过 `sim_config` 而非 `_mjModel.opt.timestep`。

```python
@property
def ctrl(self) -> np.ndarray
```
返回当前控制输入。

### 状态设置

```python
def set_joint_qpos(qpos: np.ndarray) -> None
```
设置广义坐标 qpos（全量设置）。设置后需调用 `mj_forward()` 更新派生量。

```python
def set_joint_qvel(qvel: np.ndarray) -> None
```
设置广义速度 qvel（全量设置）。设置后需调用 `mj_forward()`。

### 力应用（P4 可追踪）

```python
def apply_body_force(body_name: str, force: np.ndarray, torque: np.ndarray) -> None
```
对指定 body 施加外力/力矩。**替代老体系直接写 `xfrc_applied`**。按 body_name 解析 body_id 后委托。

```python
def clear_body_force(body_name: str) -> None
```
清除指定 body 的外力。

```python
def clear_all_forces() -> None
```
清除所有 body 的外力。

```python
def mj_apply_force_at_site(site_name: str, force: np.ndarray, torque: np.ndarray) -> None
```
在指定 site 处施加外力/力矩。

```python
def mj_clear_xfrc_applied_for_site(site_name: str) -> None
```
清零指定 site 所属 body 的 xfrc。

### Mocap 与几何体设置

```python
def set_mocap_pos_and_quat(mocap_pos_and_quat_dict: dict) -> None
```
设置 mocap body 位置/四元数。本地写入 + 渲染模式下自动同步到远端 Studio。

```python
def set_geom_friction(geom_friction_dict: dict) -> None
```
设置几何体摩擦系数 `{geom_name: [slide, torsional, roll]}`。

```python
def add_extra_weight(weight_load_dict: dict) -> None
```
为 body 添加额外质量和质心偏移。

### 状态查询

以下方法全部委托 `self._gym` 公共方法，按名称访问（无需 id）：

```python
# 关节查询
def query_joint_qpos(joint_names: list[str]) -> dict[str, np.ndarray]
def query_joint_qvel(joint_names: list[str]) -> dict[str, np.ndarray]
def query_joint_qacc(joint_names: list[str]) -> dict[str, np.ndarray]
def query_joint_offsets(joint_names: list[str]) -> dict[str, np.ndarray]
def query_joint_lengths(joint_names: list[str]) -> dict[str, np.ndarray]
def query_joint_dofadrs(joint_names: list[str]) -> dict[str, int]
def jnt_qposadr(joint_name: str) -> int
def jnt_dofadr(joint_name: str) -> int

# Body 位姿
def get_body_xpos_xmat_xquat(body_name_list: list[str]) -> dict
def get_body_xpos_xmat_xquat_xvel(body_name_list: list[str]) -> dict

# Site 查询
def query_site_pos_and_mat(site_names: list[str]) -> dict
def query_site_size(site_names: list[str]) -> dict[str, np.ndarray]

# 传感器/执行器/接触
def query_sensor_data(sensor_names: list[str]) -> dict[str, np.ndarray]
def query_actuator_torques(actuator_names: list[str]) -> dict[str, np.ndarray]
def query_contact_simple() -> list[dict]
def query_contact_force(contact_ids: list[int]) -> dict[int, np.ndarray]
def get_cfrc_ext() -> np.ndarray
def get_goal_bounding_box(geom_name: str) -> np.ndarray
def body_subtree_mass(body_name: str) -> float
```

### 基座坐标系变换

以下方法**在 Env 层实现**（纯 NumPy 变换，不依赖 MuJoCo），依赖 DataView/Model 公共查询：

```python
def query_site_pos_and_quat_B(site_names, base_body_list) -> dict
def query_site_xvalp_xvalr(site_names) -> tuple[dict, dict]
def query_site_xvalp_xvalr_B(site_names, base_body_list) -> tuple[dict, dict]
def query_velocity_body_B(ee_body, base_body) -> np.ndarray       # 6D 速度（基座系）
def query_position_body_B(ee_body, base_body) -> np.ndarray       # 3D 位置（基座系）
def query_orientation_body_B(ee_body, base_body) -> np.ndarray    # 四元数（基座系）
def query_joint_axes_B(joint_names, base_body) -> dict            # 关节轴方向（基座系）
```

### 里程计查询

```python
def query_robot_velocity_odom(base_body, initial_base_pos, initial_base_quat) -> tuple
def query_robot_position_odom(base_body, initial_base_pos, initial_base_quat) -> np.ndarray
def query_robot_orientation_odom(base_body, initial_base_pos, initial_base_quat) -> np.ndarray
```

### 雅可比

```python
def mj_jacBody(jacp: np.ndarray, jacr: np.ndarray, body_name: str) -> None
```
计算 body 雅可比（原地写 jacp/jacr）。按 body_name 解析 id 后委托。

```python
def mj_jacSite(jacp: np.ndarray, jacr: np.ndarray, site_name: str) -> None
def mj_jac_site(site_names: list[str]) -> dict[str, dict]
```

### 等式约束操作

```python
def update_equality_constraints(eq_list: list[dict]) -> None
```
更新等式约束列表（Env 层 name→id 解析后委托）。

```python
def modify_equality_objects(eq_ids: list[int], obj1_names=None, obj2_names=None) -> None
```
修改等式约束关联对象（Env 层 name→id 解析后委托）。

```python
def update_anchor_equality_constraints(actor_name: str, anchor_type: str = "weld") -> None
```
锚点约束更新（connect/weld 联动 actor 与 mocap body）。

### 体操作

```python
def anchor_actor(actor_name: str, anchor_type: str = "weld") -> None
```
锚定 actor body：设置 mocap 位姿到 actor 当前位置 + 建立 weld/connect 等式约束。

```python
def release_body_anchored() -> None
```
释放锚定的 actor：清除锚点等式约束 + 清除锚定状态。

```python
def do_body_manipulation() -> None
```
Studio UI 体操作编排：根据 UI 状态执行锚定/移动/释放。在 `render()` 中自动调用。

### Studio 交互

```python
def render() -> NDArray[np.float64] | None
```
渲染当前状态到 OrcaStudio（在线模式）。离线模式返回 None。

```python
def studio_bridge() -> OrcaStudioBridge
```
返回 OrcaStudio 桥接对象（方法而非 property，防止 `gym.studio` 式穿墙）。

```python
def begin_save_video(file_path, capture_mode=0) -> None
def stop_save_video() -> None
def get_current_frame() -> int
def get_next_frame() -> int
def get_camera_time_stamp(last_frame_index) -> dict
def get_frame_png(image_path) -> None
def load_content_file(content_file_name, **kwargs) -> None
```

### 生命周期方法

```python
def initialize_grpc()           # 创建 gRPC 通道 + stub + OrcaGymEuler
def initialize_simulation()     # 加载模型 → init_simulation → 返回 (model, data)
def reset_simulation()          # reset_data + sync_to_view
def init_qpos_qvel()            # 缓存初始 qpos/qvel
def set_time_step(time_step)    # 设置时间步长（本地 + 远端）
def pause_simulation()          # 暂停仿真（离线模式 no-op）
def close()                     # 关闭 gRPC 通道
```

### 抽象方法（子类必须实现）

```python
def step(action: NDArray[np.float32]) -> tuple[ObsType, float, bool, bool, dict]
def reset_model() -> tuple[dict, dict]
def _get_obs() -> dict
```

### 内部方法（子类可用）

```python
def _sync_view() -> None
```
同步 DataView（封装 `_gym.sync_to_view()`），子类通过此方法同步数据，不直接触 `_gym`。

### 使用示例

```python
import numpy as np
from orca_gym.environment.euler.orca_gym_euler_env import OrcaGymEulerEnv

class MyRobotEnv(OrcaGymEulerEnv):
    def __init__(self):
        super().__init__(
            frame_skip=5,
            orcagym_addr="localhost:50051",
            agent_names=["robot_1"],
            time_step=0.001,
        )
        # 定义动作空间
        ctrlrange = self.model.get_actuator_ctrlrange()
        self.action_space = self.generate_action_space(ctrlrange)

        # 定义观测空间
        self.observation_space = self.generate_observation_space(self._get_obs())

    def _get_obs(self) -> dict:
        return {
            "joint_pos": self.query_joint_qpos(self._joint_names),
            "joint_vel": self.query_joint_qvel(self._joint_names),
        }

    def step(self, action):
        self.do_simulation(action, self.frame_skip)  # ✅ 走公共 API
        obs = self._get_obs()
        reward = self.compute_reward(obs)
        terminated = self.check_termination()
        truncated = False
        return obs, reward, terminated, truncated, {}

    def reset_model(self):
        qpos = self.init_qpos + self.np_random.uniform(-0.1, 0.1, self.model.nq)
        qvel = self.init_qvel + self.np_random.uniform(-0.1, 0.1, self.model.nv)
        self.set_joint_qpos(qpos)    # ✅ 走公共 API
        self.set_joint_qvel(qvel)
        self.mj_forward()
        self._sync_view()
        return self._get_obs(), {}
```

---

## OrcaGymEnvMixin（公共方法 Mixin）

位于 `orca_gym/environment/orca_gym_env_mixin.py`。抽取 `OrcaGymLocalEnv`/`OrcaGymBaseEnv` 中与仿真引擎无关的公共方法，供 `OrcaGymEulerEnv` 和 `OrcaGymLocalEnv` 共享。

**设计要点：** 纯方法集合，不定义 `__init__`，不持有状态，不引入编排冲突。方法仅依赖 `self._agent_names` 等基础字段。

### 名称空间解析

为名称添加智能体前缀（格式 `{agent_name}_{原始名称}`）：

```python
def body(name: str, agent_id: int = None) -> str
def joint(name: str, agent_id: int = None) -> str
def actuator(name: str, agent_id: int = None) -> str
def site(name: str, agent_id: int = None) -> str
def mocap(name: str, agent_id: int = None) -> str
def sensor(name: str, agent_id: int = None) -> str
```

- `agent_id=None` 时默认使用 `agent_names[0]`
- `agent_names` 为空时不添加前缀

### 空间生成

```python
def generate_action_space(bounds: np.ndarray) -> spaces.Box
```
根据执行器控制范围 `(nu, 2)` 创建连续动作空间。

```python
def generate_observation_space(obs: dict | np.ndarray) -> spaces.Space
```
根据观测数据创建观测空间。

### reset 编排

```python
def reset(*, seed: int | None = None, options: dict | None = None) -> tuple[dict, dict]
```
流程：`super().reset(seed=seed)` → `reset_simulation()` → `reset_model()` → `render()`。

```python
def set_seed_value(seed: int | None = None)
```
设置随机种子，创建 `self.np_random`。

### 其他

```python
@property
def agent_num(self) -> int    # 智能体数量
```

---

## OrcaGymLocalEnv（老体系，维护模式）

位于 `orca_gym/environment/orca_gym_local_env.py`。老体系本地 MuJoCo 环境，继承 `OrcaGymBaseEnv`。

> ⚠️ **注意**：此类是老体系核心环境类，直接暴露 `self.gym` 为公共属性。新项目推荐使用 `OrcaGymEulerEnv`。

### 构造参数

```python
class OrcaGymLocalEnv(OrcaGymBaseEnv):
    def __init__(
        self,
        frame_skip: int,
        orcagym_addr: str,
        agent_names: list[str],
        time_step: float,
        **kwargs  # skip_grpc_load, local_xml_path, xml_assets_dir
    )
```

### 属性

```python
gym: OrcaGymLocal           # backend 实例（公共属性）
model: OrcaGymModel         # 模型信息
data: OrcaGymData           # 动态状态（仅 5 字段）
frame_skip: int             # step() 对应的物理步数
seed: int                   # 随机种子

@property dt: float         # 环境时间步长 = opt.timestep × frame_skip
```

### 仿真核心

```python
def do_simulation(ctrl: np.ndarray, n_frames: int) -> None
```
执行完整仿真步进：检查维度 → `set_ctrl` → `mj_step(n_frames)` → `update_data()`。

```python
def set_ctrl(ctrl: np.ndarray)
def mj_step(nstep: int)
def mj_forward()
def update_data()
```

### 生命周期

```python
def initialize_simulation() -> tuple[OrcaGymModel, OrcaGymData]
def initialize_grpc()
def reset_simulation()
def init_qpos_qvel()
def set_time_step(time_step: float)
def close()
```

### Body/Site 查询

```python
def get_body_xpos_xmat_xquat(body_name_list: list[str]) -> tuple
def get_body_xpos_xmat_xquat_xvel(body_name_list: list[str]) -> tuple
def query_site_pos_and_mat(site_names: list[str]) -> dict
def query_site_pos_and_quat(site_names: list[str]) -> dict
def query_site_pos_and_quat_B(site_names, base_body_list) -> dict
def query_site_size(site_names: list[str]) -> dict
def query_site_xvalp_xvalr(site_names: list[str]) -> tuple
def query_site_xvalp_xvalr_B(site_names, base_body_list) -> tuple
```

### 关节查询与设置

```python
def query_joint_qpos(joint_names: list[str]) -> dict
def query_joint_qvel(joint_names: list[str]) -> dict
def query_joint_qacc(joint_names: list[str]) -> dict
def query_joint_offsets(joint_names: list[str]) -> tuple
def query_joint_lengths(joint_names: list[str]) -> tuple
def jnt_qposadr(joint_name: str) -> int
def jnt_dofadr(joint_name: str) -> int
def query_joint_dofadrs(joint_names: list[str]) -> dict
def set_joint_qpos(joint_qpos: dict)
def set_joint_qvel(joint_qvel: dict)
```

### 传感器/接触/外力

```python
def query_sensor_data(sensor_names: list[str]) -> dict
def query_contact_simple() -> list
def query_contact_force(contact_ids: list[int]) -> dict
def get_cfrc_ext() -> np.ndarray
def apply_force_to_body(body_name, force, torque)  # 直接写 xfrc_applied
```

### Mocap / 等式约束 / 体操作

```python
def anchor_actor(actor_name: str, anchor_type: AnchorType)
def release_body_anchored()
def update_anchor_equality_constraints(actor_name, anchor_type)
def set_mocap_pos_and_quat(mocap_dict: dict)
def update_equality_constraints(eq_list: list)
```

### 雅可比 / 力控制

```python
def mj_jacBody(jacp: np.ndarray, jacr: np.ndarray, body_id: int)
def mj_jacSite(jacp: np.ndarray, jacr: np.ndarray, site_name: str)
def mj_apply_force_at_site(site_name, force, torque)
def mj_clear_xfrc_applied_for_site(site_name)
```

### 基座坐标系 / 里程计

```python
def query_velocity_body_B(ee_body, base_body) -> np.ndarray
def query_position_body_B(ee_body, base_body) -> np.ndarray
def query_orientation_body_B(ee_body, base_body) -> np.ndarray
def query_joint_axes_B(joint_names, base_body) -> dict
def query_robot_velocity_odom(base_body, initial_base_pos, initial_base_quat) -> tuple
def query_robot_position_odom(base_body, initial_base_pos, initial_base_quat) -> np.ndarray
def query_robot_orientation_odom(base_body, initial_base_pos, initial_base_quat) -> np.ndarray
```

### 执行器/几何体/视频/UI

```python
def query_actuator_torques(actuator_names) -> dict
def set_actuator_trnid(actuator_id, trnid)
def disable_actuator(actuator_groups)
def set_geom_friction(geom_friction_dict)
def add_extra_weight(weight_load_dict)
def get_goal_bounding_box(geom_name) -> dict
def begin_save_video(file_path, capture_mode=CaptureMode.ASYNC)
def stop_save_video()
def get_current_frame() -> int
def get_next_frame() -> int
def get_camera_time_stamp(last_frame) -> dict
def get_frame_png(image_path) -> dict
def get_body_manipulation_anchored() -> tuple
def get_body_manipulation_movement() -> tuple
def load_content_file(content_file_name, **kwargs) -> str
```

---

## OrcaGymBaseEnv（老体系基类，维护模式）

位于 `orca_gym/environment/orca_gym_env.py`。老体系环境的抽象基类，继承 `gymnasium.Env`。

> ⚠️ **注意**：新项目推荐使用 `OrcaGymEulerEnv`（直接继承 `gym.Env` + `OrcaGymEnvMixin`）。

### 构造参数

```python
class OrcaGymBaseEnv(gym.Env):
    def __init__(self, frame_skip, orcagym_addr, agent_names, time_step, **kwargs)
```

### 属性

```python
gym: OrcaGymLocal     # backend 实例（公共属性）
model: OrcaGymModel   # 模型信息
data: OrcaGymData     # 动态状态
@property dt: float   # 时间步长
@property agent_num: int  # 智能体数量
```

### 抽象方法（子类实现）

```python
def step(action) -> tuple
def reset_model() -> tuple[dict, dict]
def initialize_simulation() -> tuple[OrcaGymModel, OrcaGymData]
def _step_orca_sim_simulation(ctrl, n_frames)
def render()
```

### 工具方法

```python
def generate_action_space(bounds: np.ndarray) -> spaces.Box
def generate_observation_space(obs) -> spaces.Space
def reset(*, seed=None, options=None) -> tuple
def set_seed_value(seed=None)
```

### 多智能体命名

```python
def body(name, agent_id=None) -> str
def joint(name, agent_id=None) -> str
def actuator(name, agent_id=None) -> str
def site(name, agent_id=None) -> str
def mocap(name, agent_id=None) -> str
def sensor(name, agent_id=None) -> str
```

### 生命周期方法

```python
def initialize_grpc()
def pause_simulation()
def set_time_step(time_step)
def init_qpos_qvel()
def reset_simulation()
def close()
```

---

## OrcaGymRemoteEnv（老体系远程环境）

位于 `orca_gym/environment/orca_gym_remote_env.py`。远程环境，仿真在服务端运行、Python 客户端通过 gRPC 远程控制。

### 远程状态查询

```python
def get_body_xpos_xmat_xquat(body_name_list) -> tuple
def get_body_com_xpos_xmat(body_name_list) -> tuple
def get_geom_xpos_xmat(geom_name_list) -> tuple
def query_joint_qpos(joint_names) -> dict
def query_joint_qvel(joint_names) -> dict
def query_site_pos_and_mat(site_names) -> dict
def query_site_pos_and_quat(site_names) -> dict
def query_site_xvalp_xvalr(site_names) -> tuple
def query_sensor_data(sensor_names) -> dict
def query_contact_simple() -> list
def query_contact_force(contact_ids) -> dict
def query_cfrc_ext(body_names) -> tuple
def query_actuator_force() -> dict
def query_mocap_pos_and_quat(mocap_body_names) -> dict
def query_opt_config() -> dict
def query_all_geoms() -> dict
def query_joint_offsets(joint_names) -> tuple
def query_joint_limits(joint_names) -> dict
def query_body_velocities(body_names) -> dict
def query_actuator_gain_prm(actuator_names) -> dict
def query_actuator_bias_prm(actuator_names) -> dict
def query_qfrc_bias() -> np.ndarray
def query_subtree_com(body_name) -> dict
```

### 远程状态设置

```python
def set_qpos_qvel(qpos, qvel)
def set_joint_qpos(joint_qpos)
def set_mocap_pos_and_quat(mocap_dict)
def set_opt_config()
def set_ctrl(ctrl)
def set_actuator_gain_prm(gain_prm_set_list)
def set_actuator_bias_prm(bias_prm_set_list)
def set_geom_friction(geom_name_list, friction_list)
```

### 远程动力学与关键帧

```python
def update_equality_constraints(eq_list)
def mj_jac(body_point_list, compute_jacp=True, compute_jacr=True) -> tuple
def calc_full_mass_matrix() -> np.ndarray
def load_keyframe(keyframe_name)
```

---

## 异步环境

位于 `orca_gym/environment/async_env/`。

### OrcaGymAsyncEnv

单环境异步包装器。

```python
class OrcaGymAsyncEnv:
    def __init__(self, env_fn: callable, num_envs: int)
```

### OrcaGymVectorEnv

向量化环境，并行执行多个环境。

```python
class OrcaGymVectorEnv:
    def __init__(self, env_fns: list[callable])
    def step(actions) -> tuple   # (obs, rewards, terminated, truncated, infos)
    def reset() -> tuple         # (obs, infos)
```

### SingleAgentEnvRunner

单智能体环境运行器。

```python
class SingleAgentEnvRunner:
    def __init__(self, env_fn: callable, policy, num_episodes: int)
    def run() -> list
```

---

## 典型调用链（Recipes）

### 环境初始化（Euler 体系）

```
OrcaGymEulerEnv.__init__
  → initialize_grpc()          # 创建 _gym/_stub/_channel/_studio_bridge
  → pause_simulation()
  → set_time_step(time_step)    # 缓存 _time_step
  → initialize_simulation()     # load_model_xml + init_simulation + 重新应用缓存 timestep
  → reset_simulation()          # reset_data + sync_to_view
  → init_qpos_qvel()            # 缓存 init_qpos/init_qvel
```

### step 链

```
action (policy 输出)
  → env.do_simulation(ctrl, self.frame_skip)
    → self._gym.step_with_coupling(ctrl, n_frames, dt)  # K8: 封装 _euler 访问
    → self._gym.sync_to_view()     # 同步 DataView
  → 读取 env.data 生成 obs、reward
```

### 修改状态链

```
set_joint_qpos / set_joint_qvel / set_mocap_pos_and_quat
  → mj_forward()               # 必须先 forward —— 否则派生量不一致
  → _gym.sync_to_view()        # 若需从 env.data 读取
```

> **重要**：MuJoCo 有很多"派生量"（site/body 位姿、传感器、接触等）需要 `mj_forward` 才会一致。只改 `qpos/qvel` 不 forward，后续查询位姿/传感器很容易出现 **NaN/旧值/不一致**。

### 外力注入链（Euler 体系）

```
env.apply_body_force("torso_link", [0, 0, 200], [0, 0, 0])
  → env.model.body_name2id("torso_link")  # Env 层 name→id 解析
  → self._gym.apply_body_force(body_id, force, torque)  # K4: 委托 Gym 公共方法
    → self._sim.apply_body_force(...)  # SimCore 内部写 _mjData.xfrc_applied

# ❌ 禁止：
# env._gym._sim._mjData.xfrc_applied[id, :3] = force  # ruff SLF001 报警
```

### 抓取/锚定链（mocap + 等式约束）

```
1) env.anchor_actor("box_object", "weld")
     → get_body_xpos_xmat_xquat(["box_object"])  # 读取当前位姿
     → set_mocap_pos_and_quat({mocap: actor_pose})  # mocap 移到物体位姿
     → update_anchor_equality_constraints("box_object", "weld")  # 建立 weld 约束

2) env.set_mocap_pos_and_quat({mocap: {"pos": [...], "quat": [...]}})  # 驱动 mocap

3) env.release_body_anchored()  # 清除约束 + 释放
```

### 常见"数据不同步"问题自检表

若出现"读到旧状态 / 观测跳变 / 位姿不对"，优先检查：

- 是否在 `mj_step/do_simulation` 后**数据已被同步到 DataView**？
- 是否在修改 `qpos/qvel/mocap` 后**调用了 `mj_forward()`**？
- 读取 `env.data.qpos` 时是否遗漏 `copy()`，导致后续被覆盖？
- 是否在多线程/多进程环境中并发读写同一 env（不推荐）？

---

## RewardType

定义奖励类型常量。

```python
class RewardType:
    SPARSE = "sparse"
    DENSE = "dense"
```
