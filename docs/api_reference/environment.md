# 🌍 Environment API

Gymnasium 环境接口，位于 `orca_gym/environment/`。提供标准的强化学习环境抽象，支持本地仿真和远程 gRPC 仿真两种模式。

## 环境类型

| 类 | 位置 | 说明 |
|----|------|------|
| `OrcaGymBaseEnv` | `orca_gym/environment/orca_gym_env.py` | 抽象基类，Gymnasium `Env` 的子类 |
| `OrcaGymLocalEnv` | `orca_gym/environment/orca_gym_local_env.py` | 本地 MuJoCo 环境（**最常用**） |
| `OrcaGymRemoteEnv` | `orca_gym/environment/orca_gym_remote_env.py` | 远程 gRPC 驱动环境 |
| `OrcaGymAsyncEnv` | `orca_gym/environment/async_env/` | 异步并行环境 |
| `OrcaGymVectorEnv` | `orca_gym/environment/async_env/` | 向量化并行环境 |

---

## OrcaGymBaseEnv

所有环境的抽象基类，继承自 `gymnasium.Env`。子类必须实现 `step()`、`reset_model()`、`initialize_simulation()` 等抽象方法。

### 构造参数

```python
class OrcaGymBaseEnv(gym.Env):
    def __init__(
        self,
        frame_skip: int,           # 每次 step() 对应的物理仿真步数
        orcagym_addr: str,         # gRPC 服务端地址（如 "localhost:50051"）
        agent_names: list[str],    # 智能体名称列表
        time_step: float,          # 物理仿真时间步长（秒）
        **kwargs
    )
```

### 属性

```python
gym: OrcaGymLocal           # backend 实例（OrcaGymLocal 对象）
model: OrcaGymModel         # 模型信息
data: OrcaGymData           # 动态状态
frame_skip: int             # step() 对应的物理步数
orcagym_addr: str           # gRPC 服务端地址
seed: int                   # 随机种子
loop: asyncio.AbstractEventLoop  # 异步事件循环

@property dt: float         # 环境时间步长 = timestep × frame_skip
@property agent_num: int    # 智能体数量
```

### 抽象方法（子类必须实现）

```python
def step(action: NDArray[np.float32]) -> tuple[ObsType, float, bool, bool, dict]
```
执行一次 Gym step。接收动作，返回 `(obs, reward, terminated, truncated, info)`。

```python
def reset_model() -> tuple[dict, dict]
```
重置机器人自由度为初始状态。返回 `(obs, info)`。

```python
def initialize_simulation() -> tuple[OrcaGymModel, OrcaGymData]
```
初始化 MuJoCo 仿真（加载模型、创建数据结构）。

```python
def _step_orca_sim_simulation(ctrl, n_frames) -> None
```
步进仿真：设置控制 → 执行 n_frames 物理步。

```python
def render() -> NDArray[np.float64] | None
```
渲染当前帧。

### 工具方法

```python
def generate_action_space(bounds: np.ndarray) -> spaces.Box
```
根据执行器控制范围 `(nu, 2)` 创建连续动作空间（`spaces.Box`，dtype `float32`）。

```python
def generate_observation_space(obs: dict | np.ndarray) -> spaces.Space
```
根据观测数据创建观测空间。obs 为 `np.ndarray` 时返回 `Box`，为 `dict` 时返回 `spaces.Dict`。

```python
def reset(*, seed: int | None = None, options: dict | None = None) -> tuple[dict, dict]
```
重置环境到初始状态。流程：`reset_simulation()` → `reset_model()` → `render()`。返回 `(obs, info)`。

```python
def set_seed_value(seed: int | None = None)
```
设置随机种子，创建 `self.np_random`（RandomState）。

### 多智能体命名

以下方法为名称添加智能体前缀（格式 `{agent_name}_{原始名称}`）。

```python
def body(name: str, agent_id: int = None) -> str
def joint(name: str, agent_id: int = None) -> str
def actuator(name: str, agent_id: int = None) -> str
def site(name: str, agent_id: int = None) -> str
def mocap(name: str, agent_id: int = None) -> str
def sensor(name: str, agent_id: int = None) -> str
```

- `agent_id=None` 时默认使用 `agent_names[0]`。
- 当 `agent_names` 为空列表时不添加前缀。

### 生命周期方法

```python
def initialize_grpc()        # 创建 gRPC 通道和 stub，构造 OrcaGymLocal
def pause_simulation()       # 暂停服务端仿真（被动模式）
def set_time_step(time_step: float)  # 设置仿真时间步长
def init_qpos_qvel()         # 缓存初始 qpos/qvel（供后续 reset 使用）
def reset_simulation()       # 重置仿真（load_initial_frame + update_data + set_time_step）
def close()                  # 关闭 gRPC 通道
```

---

## OrcaGymLocalEnv

**最常用的环境类**。封装本地 MuJoCo 仿真，通过 gRPC 与 OrcaSim 服务器通信进行可视化。

### 元数据

```python
metadata = {
    'render_modes': ['human', 'none'],
    'version': '0.0.1',
    'render_fps': 30
}
```

### 构造参数

```python
class OrcaGymLocalEnv(OrcaGymBaseEnv):
    def __init__(
        self,
        frame_skip: int,
        orcagym_addr: str,
        agent_names: list[str],
        time_step: float,
        **kwargs  # 支持: skip_grpc_load, local_xml_path, xml_assets_dir
    )
```

### 仿真核心

```python
def do_simulation(ctrl: np.ndarray, n_frames: int) -> None
```
执行一次完整的仿真步进。检查控制维度 → `set_ctrl` → `mj_step(n_frames)` → `update_data()`。是 `step()` 的核心实现方法。

```python
def set_ctrl(ctrl: np.ndarray)
```
设置执行器控制输入，形状 `(nu,)`。

```python
def mj_step(nstep: int)
```
执行 `nstep` 次 MuJoCo 物理步进。

```python
def mj_forward()
```
前向计算，更新运动学/传感器等派生量。在修改状态后需要调用。

```python
def update_data()
```
从 `_mjData` 同步最新状态到 `self.data`。

### 仿真生命周期

```python
def initialize_simulation() -> tuple[OrcaGymModel, OrcaGymData]
```
异步加载模型 XML → 初始化 MuJoCo 仿真 → 返回 `(model, data)`。

```python
def initialize_grpc()
```
创建 gRPC aio 通道（最大消息 1GB）→ 构造 `GrpcServiceStub` → 创建 `OrcaGymLocal(stub)`。

```python
def reset_simulation()
```
`load_initial_frame()` → `update_data()` → `set_time_step(time_step)`。

```python
def init_qpos_qvel()
```
缓存初始状态到 `self.init_qpos` 和 `self.init_qvel`（均为 ravel().copy()）。

```python
def set_time_step(time_step: float)
```
更新本地 `opt.timestep`、`realtime_step`，并同步到服务端。

```python
def close()
```
关闭 gRPC 通道。

### Body 位姿查询

```python
def get_body_xpos_xmat_xquat(body_name_list: list[str]) -> tuple
```
获取 body 位姿。返回 `(xpos, xmat, xquat)`：
- `xpos`: flat 数组 `(len*3,)`，每 3 个元素为 `[x, y, z]`
- `xmat`: flat 数组 `(len*9,)`，每 9 个元素为 3×3 矩阵按行展开
- `xquat`: flat 数组 `(len*4,)`，每 4 个元素为 `[w, x, y, z]`

```python
def get_body_xpos_xmat_xquat_xvel(body_name_list: list[str]) -> tuple
```
Body 位姿 + 世界系线速度。返回 `(xpos, xmat, xquat, xvel)`，`xvel` 形状 `(len, 3)`。

### Site 位姿查询

```python
def query_site_pos_and_mat(site_names: list[str]) -> dict
```
返回 `{site_name: {"xpos": array(3,), "xmat": array(9,)}}`。

```python
def query_site_pos_and_quat(site_names: list[str]) -> dict
```
返回 `{site_name: {"xpos": array(3,), "xquat": array(4,)}}`。四元数从 xmat 转换得来 `[w, x, y, z]`。

```python
def query_site_pos_and_quat_B(
    site_names: list[str],
    base_body_list: list[str],
) -> dict
```
返回 site 在基座坐标系中的位姿 `{site_name: {"xpos": array(3,), "xquat": array(4,)}}`。

```python
def query_site_size(site_names: list[str]) -> dict
```
返回 `{site_name: size_array}`。

### Site 速度查询

```python
def query_site_xvalp_xvalr(site_names: list[str]) -> tuple[dict, dict]
```
返回 `(xvalp_dict, xvalr_dict)`——site 在世界系中的线速度和角速度（通过 `jac @ qvel` 计算）。

```python
def query_site_xvalp_xvalr_B(
    site_names: list[str],
    base_body_list: list[str],
) -> tuple[dict, dict]
```
Site 在基座坐标系中的线速度和角速度，dtype `float32`。

### 关节状态查询

```python
def query_joint_qpos(joint_names: list[str]) -> dict
```
返回 `{joint_name: qpos_array}`。

```python
def query_joint_qvel(joint_names: list[str]) -> dict
```
返回 `{joint_name: qvel_array}`。

```python
def query_joint_qacc(joint_names: list[str]) -> dict
```
返回 `{joint_name: qacc_array}`。

```python
def query_joint_offsets(joint_names: list[str]) -> tuple
```
返回 `(qpos_offsets, qvel_offsets, qacc_offsets)`。

```python
def query_joint_lengths(joint_names: list[str]) -> tuple
```
返回 `(qpos_lengths, qvel_lengths, qacc_lengths)`。

```python
def jnt_qposadr(joint_name: str) -> int
```
关节在 `qpos` 中的起始地址。

```python
def jnt_dofadr(joint_name: str) -> int
```
关节在 `qvel` 中的起始地址。

```python
def query_joint_dofadrs(joint_names: list[str]) -> dict
```
批量查询 DOF 地址 `{joint_name: dof_adr}`。

### 关节状态设置

```python
def set_joint_qpos(joint_qpos: dict)
```
按关节名设置位置。`{joint_name: qpos_array}`。修改后需调用 `mj_forward()`。

```python
def set_joint_qvel(joint_qvel: dict)
```
按关节名设置速度。`{joint_name: qvel_array}`。修改后需调用 `mj_forward()`。

### 传感器

```python
def query_sensor_data(sensor_names: list[str]) -> dict
```
返回 `{sensor_name: data_array}`。

### 接触

```python
def query_contact_simple() -> list
```
返回接触对列表 `[{"ID", "Dim", "Geom1", "Geom2"}, ...]`。

```python
def query_contact_force(contact_ids: list[int]) -> dict
```
返回 `{contact_id: force_array(6,)}`。

```python
def get_cfrc_ext() -> np.ndarray
```
返回外部约束力 `(nbody, 6)`。

### 物体操作

```python
def anchor_actor(actor_name: str, anchor_type: AnchorType)
```
锚定一个 actor（body 或 flex），用于通过 mocap body 进行拖拽。支持普通 body（WELD/BALL）、flex vertex 和 interpolated flex（自动强制 BALL）。

```python
def release_body_anchored()
```
释放当前锚定的物体。将约束改回 dummy body，锚点移出视野。

```python
def update_anchor_equality_constraints(actor_name: str, anchor_type: AnchorType)
```
更新等式约束，将锚点与目标 actor 连接。内部修改 eq_list 的 `obj2_id` 和 `eq_type`。

### Mocap

```python
def set_mocap_pos_and_quat(mocap_pos_and_quat_dict: dict)
```
设置 mocap body 位姿。`{mocap_body: {"pos": array(3,), "quat": array(4,)}}`。渲染模式下自动同步到服务端。

### 雅可比

```python
def mj_jacBody(jacp: np.ndarray, jacr: np.ndarray, body_id: int)
```
计算 body 的雅可比（输出到 jacp/jacr）。

```python
def mj_jacSite(jacp: np.ndarray, jacr: np.ndarray, site_name: str)
```
计算 site 的雅可比。

### 力控制

```python
def mj_apply_force_at_site(
    site_name: str,
    force: np.ndarray,    # [fx, fy, fz] 世界系
    torque: np.ndarray,   # [tx, ty, tz] 世界系
)
```
在指定 site 处施加外力/力矩（写入 `xfrc_applied`）。

```python
def mj_clear_xfrc_applied_for_site(site_name: str)
```
清零指定 site 所属 body 的 `xfrc_applied`。

```python
def apply_force_to_body(
    body_name: str,
    force: np.ndarray,    # [fx, fy, fz] 世界系
    torque: np.ndarray,   # [tx, ty, tz] 世界系
)
```
在指定 body 上施加外力和力矩（直接写入 `_mjData.xfrc_applied`）。

### 等式约束

```python
def update_equality_constraints(eq_list: list)
```
更新等式约束列表。

### 基座坐标系查询

```python
def query_velocity_body_B(ee_body: str, base_body: str) -> np.ndarray
```
6D 速度 `[vx, vy, vz, wx, wy, wz]`（基座坐标系），dtype `float32`。

```python
def query_position_body_B(ee_body: str, base_body: str) -> np.ndarray
```
3D 位置 `[x, y, z]`（基座坐标系）。

```python
def query_orientation_body_B(ee_body: str, base_body: str) -> np.ndarray
```
四元数 `[x, y, z, w]`（基座坐标系），dtype `float32`。

```python
def query_joint_axes_B(joint_names: list[str], base_body: str) -> dict
```
关节轴方向（基座坐标系）。返回 `{joint_name: axis_array(3,)}`，dtype `float32`。

### 里程计查询

```python
def query_robot_velocity_odom(
    base_body: str,
    initial_base_pos: np.ndarray,
    initial_base_quat: np.ndarray,
) -> tuple
```
返回 `(linear_vel_odom, angular_vel_odom)`，各为 `(3,) float32`。

```python
def query_robot_position_odom(
    base_body: str,
    initial_base_pos: np.ndarray,
    initial_base_quat: np.ndarray,
) -> np.ndarray
```
返回 `[x, y, z]`（里程计坐标系），dtype `float32`。

```python
def query_robot_orientation_odom(
    base_body: str,
    initial_base_pos: np.ndarray,
    initial_base_quat: np.ndarray,
) -> np.ndarray
```
返回四元数 `[x, y, z, w]`（里程计坐标系），dtype `float32`。

### 执行器配置

```python
def query_actuator_torques(actuator_names: list[str]) -> dict
```
查询执行器扭矩 `{actuator_name: torque_array(6,)}`。

```python
def set_actuator_trnid(actuator_id: int, trnid: int)
```
修改执行器传输目标 ID。

```python
def disable_actuator(actuator_groups: list[int])
```
禁用指定组的执行器。

### 几何体

```python
def set_geom_friction(geom_friction_dict: dict)
```
设置几何体摩擦系数 `{geom_name: [slide, torsional, roll]}`。

```python
def add_extra_weight(weight_load_dict: dict)
```
添加额外质量 `{body_id: {"pos": array(3,), "weight": float}}`。

```python
def get_goal_bounding_box(geom_name: str) -> dict
```
计算物体世界系 AABB `{"min", "max", "size"}`。

### 视频录制

```python
def begin_save_video(file_path: str, capture_mode: CaptureMode = CaptureMode.ASYNC)
```
开始保存 MP4 视频。

```python
def stop_save_video()
```
停止保存视频。

```python
def get_current_frame() -> int
```
获取当前帧索引。

```python
def get_next_frame() -> int
```
获取下一帧索引（自动等待直到帧更新，最多 10 次重试）。

```python
def get_camera_time_stamp(last_frame: int) -> dict
```
获取相机时间戳 `{camera_name: [timestamps]}`。

```python
def get_frame_png(image_path: str) -> dict
```
保存帧 PNG，返回相机位姿 `{camera_name: {"pos", "quat"}}`。

### UI 交互

```python
def get_body_manipulation_anchored() -> tuple
```
返回 `(body_name, anchor_type)` 或 `(None, AnchorType.NONE)`。

```python
def get_body_manipulation_movement() -> tuple
```
返回 `(delta_pos, delta_quat)`。

### 资源加载

```python
def load_content_file(
    content_file_name: str,
    remote_file_dir: str = "",
    local_file_dir: str = "",
    temp_file_path: str | None = None,
) -> str
```
下载资源文件并返回本地路径。

---

## 典型使用示例

```python
import numpy as np
from orca_gym.environment import OrcaGymLocalEnv

class MyRobotEnv(OrcaGymLocalEnv):
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
        """构建观测字典"""
        joint_pos = self.query_joint_qpos(self._joint_names)
        joint_vel = self.query_joint_qvel(self._joint_names)
        return {
            "joint_pos": np.array([joint_pos[n] for n in self._joint_names]),
            "joint_vel": np.array([joint_vel[n] for n in self._joint_names]),
        }

    def step(self, action):
        """执行一步仿真"""
        for _ in range(self.frame_skip):
            self.do_simulation(action, n_frames=1)
        obs = self._get_obs()
        reward = self.compute_reward(obs)
        terminated = self.check_termination()
        truncated = False
        info = {}
        return obs, reward, terminated, truncated, info

    def reset_model(self):
        """重置机器人到初始状态"""
        self.data.qpos[:] = self.init_qpos
        self.data.qvel[:] = self.init_qvel
        self.set_joint_qpos({"joint_0": np.array([0.0])})
        self.mj_forward()
        return self._get_obs(), {}

    def compute_reward(self, obs) -> float:
        return 0.0

    def check_termination(self) -> bool:
        return False
```

---

## OrcaGymRemoteEnv

远程环境，适用于仿真运行在服务端、Python 客户端通过 gRPC 远程控制的场景。位于 `orca_gym/environment/orca_gym_remote_env.py`。

### 远程状态查询

通过 gRPC 从服务端查询仿真状态：

```python
def get_body_xpos_xmat_xquat(body_name_list: list[str]) -> tuple
def get_body_com_xpos_xmat(body_name_list: list[str]) -> tuple
def get_geom_xpos_xmat(geom_name_list: list[str]) -> tuple
def query_joint_qpos(joint_names: list[str]) -> dict
def query_joint_qvel(joint_names: list[str]) -> dict
def query_site_pos_and_mat(site_names: list[str]) -> dict
def query_site_pos_and_quat(site_names: list[str]) -> dict
def query_site_xvalp_xvalr(site_names: list[str]) -> tuple
def query_sensor_data(sensor_names: list[str]) -> dict
def query_contact_simple() -> list
def query_contact() -> list
def query_contact_force(contact_ids: list[int]) -> dict
def query_cfrc_ext(body_names: list[str]) -> tuple
def query_actuator_force() -> dict
def query_mocap_pos_and_quat(mocap_body_names: list[str]) -> dict
def query_opt_config() -> dict
def query_all_geoms() -> dict
def query_joint_offsets(joint_names: list[str]) -> tuple
def query_joint_limits(joint_names: list[str]) -> dict
def query_body_velocities(body_names: list[str]) -> dict
def query_actuator_gain_prm(actuator_names: list[str]) -> dict
def query_actuator_bias_prm(actuator_names: list[str]) -> dict
def query_qfrc_bias() -> np.ndarray
def query_subtree_com(body_name: str) -> dict
```

### 远程状态设置

```python
def set_qpos_qvel(qpos: np.ndarray, qvel: np.ndarray)
def set_joint_qpos(joint_qpos: dict)
def set_mocap_pos_and_quat(mocap_pos_and_quat_dict: dict)
def set_opt_config()
def set_ctrl(ctrl: np.ndarray)
def set_actuator_gain_prm(gain_prm_set_list: list)
def set_actuator_bias_prm(bias_prm_set_list: list)
def set_geom_friction(geom_name_list: list[str], friction_list: list)
```

### 远程动力学

```python
def update_equality_constraints(eq_list: list)
def mj_jac(body_point_list: list, compute_jacp: bool = True, compute_jacr: bool = True) -> tuple
def calc_full_mass_matrix() -> np.ndarray
```

### 远程关键帧

```python
def load_keyframe(keyframe_name: str)
```

---

## 异步环境

位于 `orca_gym/environment/async_env/`。

### OrcaGymAsyncEnv

单环境异步包装器。

```python
class OrcaGymAsyncEnv:
    def __init__(self, env_fn: callable, num_envs: int)
    # 异步并行运行多个独立的环境实例
```

### OrcaGymVectorEnv

向量化环境，并行执行多个环境。

```python
class OrcaGymVectorEnv:
    def __init__(self, env_fns: list[callable])
    def step(actions) -> tuple  # (obs, rewards, terminated, truncated, infos)
    def reset() -> tuple        # (obs, infos)
```

### SingleAgentEnvRunner

单智能体环境运行器。

```python
class SingleAgentEnvRunner:
    def __init__(self, env_fn: callable, policy, num_episodes: int)
    def run() -> list  # 运行 num_episodes 个 episode，返回结果
```

---

## RewardType

定义奖励类型常量。

```python
class RewardType:
    SPARSE = "sparse"
    DENSE = "dense"
```
