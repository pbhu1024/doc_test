# 🧬 Core API

核心仿真接口，位于 `orca_gym/core/`。封装 MuJoCo 物理引擎和 gRPC 通信。

## 架构概览

OrcaGym 当前包含两套核心仿真体系：

### Euler 体系（新主路径，推荐）

```
OrcaGymEuler (仿真核心 Facade，组合子组件)
  ├── _sim: MuJoCoSimCore        # _mjModel/_mjData 唯一存放位置（不对外暴露）
  ├── _studio: OrcaStudioBridge  # gRPC 集成（依赖反转，不持有 mjData）
  ├── _registry: ModelRegistry   # 模型注册与结构查询
  ├── _opt: SimConfig            # 求解器参数 typed 配置
  ├── _view: OrcaGymDataView     # 完整状态只读视图
  └── _euler: EulerOrchestrator | None  # Euler 耦合编排（占位）
```

### Local 体系（老路径，维护模式）

```
OrcaGymBase (gRPC 基础封装)
  └── OrcaGymLocal (本地 MuJoCo backend)
        ├── _mjModel: mujoco.MjModel     # ⚠️ 老体系直接暴露（不推荐）
        ├── _mjData:  mujoco.MjData      # ⚠️ 老体系直接暴露（不推荐）
        ├── model:    OrcaGymModel       # 封装后的模型
        ├── data:     OrcaGymData        # 封装后的状态（仅 5 字段）
        └── opt:      OrcaGymOptConfig   # MuJoCo 优化配置
```

**核心设计差异：**

| 维度 | Euler 体系（新） | Local 体系（老） |
|------|-----------------|-----------------|
| `_mjModel`/`_mjData` | 多层封装隔离，API 不可达 | 公共属性，83 处绕道访问 |
| 状态视图 | `OrcaGymDataView`（完整只读视图） | `OrcaGymData`（仅 5 字段） |
| 求解器配置 | `SimConfig`（typed property） | 直接访问 `opt.*` |
| 外力注入 | `apply_body_force()`（显式方法） | 直接写 `xfrc_applied` |
| 类结构 | Facade + 职责内聚分解 | 上帝类 |

## 顶层导出

```python
from orca_gym import (
    # Euler 体系（新主路径）
    OrcaGymEuler,           # 仿真核心 Facade
    SimConfig,              # 求解器参数 typed 配置
    OrcaGymDataView,        # 完整状态只读视图

    # Local 体系（老路径）
    OrcaGymBase,            # gRPC 基础封装
    OrcaGymLocal,           # 本地 MuJoCo backend
    OrcaGymModel,           # 静态模型信息（两套体系共用）
    OrcaGymData,            # 老体系动态状态
    OrcaGymOptConfig,       # 老体系 opt 配置快照
)
```

---

## OrcaGymEuler（新主路径）

位于 `orca_gym/core/euler/orca_gym_euler.py`。**仿真核心 Facade**，组合 `MuJoCoSimCore`、`OrcaStudioBridge`、`ModelRegistry`、`SimConfig`、`OrcaGymDataView` 等子组件，向 `OrcaGymEulerEnv` 提供仿真操作接口。

**关键设计：**
- **不暴露** `_mjModel`/`_mjData`（多层封装隔离机制：`_` 前缀约定 + ruff SLF001 静态检查 + `__getattribute__` 拦截 + `__dir__` 控制）
- 不暴露子组件对象（`_sim`/`_studio`/`_registry`/`_opt`/`_view`/`_euler` 全部带 `_` 前缀）
- Studio 交互通过**方法** `studio_bridge()` 而非 property（防止 `gym.studio` 式穿墙）

### 状态访问

```python
@property
def data(self) -> OrcaGymDataView
```
返回 MuJoCo 状态的完整只读视图。替代直接访问 `_mjData`。

```python
@property
def model(self) -> OrcaGymModel
```
返回缓存的 `OrcaGymModel`。`init_simulation()` 后构建一次并缓存，后续直接返回。

```python
@property
def sim_config(self) -> SimConfig
```
返回求解器配置（`SimConfig`）。替代直接访问 `_mjModel.opt.*`。

```python
@property
def nq(self) -> int
```
广义坐标维度（qpos 长度）。

```python
@property
def nu(self) -> int
```
控制输入维度（ctrl 长度）。

### 仿真控制

```python
def mj_step(nstep: int) -> None
```
执行 nstep 步 MuJoCo 仿真。

```python
def mj_forward() -> None
```
MuJoCo 前向计算（不步进，仅更新派生量）。

```python
def set_ctrl(ctrl: np.ndarray) -> None
```
设置控制输入，自动应用 UI 侧 override_ctrls（避免直接写 `_mjData.ctrl`）。

```python
def set_qpos_qvel(qpos: np.ndarray, qvel: np.ndarray) -> None
```
设置广义坐标和速度（供 `set_joint_qpos/qvel` 使用）。

```python
def reset_data() -> None
```
重置 MjData 到初始状态。

```python
def sync_to_view() -> None
```
将 MuJoCo 状态同步到 `OrcaGymDataView`（`env.data`）。

### 步进耦合查询

```python
def has_euler(self) -> bool
```
查询是否存在 Euler 耦合编排器。骨架阶段恒返回 `False`（`_euler` 为 `None`）。

```python
def step_with_coupling(self, ctrl: np.ndarray, n_frames: int, dt: float) -> None
```
带 Euler 耦合的步进。`has_euler()=False` 时等价于 `set_ctrl + step`。供 `do_simulation` 使用，封装对 `_euler` 的访问，Env 无需感知 Euler 存在。

### 查询委托（阶段三填充）

以下方法全部委托子组件，内部使用 `object.__getattribute__` 绕过自身的 `__getattribute__` 拦截：

```python
def query_joint_qpos(joint_names: list[str]) -> dict[str, np.ndarray]
def query_joint_qvel(joint_names: list[str]) -> dict[str, np.ndarray]
def query_joint_qacc(joint_names: list[str]) -> dict[str, np.ndarray]
def query_joint_offsets(joint_names: list[str]) -> dict[str, np.ndarray]
def query_joint_lengths(joint_names: list[str]) -> dict[str, np.ndarray]
def query_joint_dofadrs(joint_names: list[str]) -> dict[str, int]
def jnt_qposadr(joint_name: str) -> int
def jnt_dofadr(joint_name: str) -> int
def query_body_xpos_xmat_xquat(body_name_list: list[str]) -> dict
def query_body_xpos_xmat_xquat_xvel(body_name_list: list[str]) -> dict
def query_site_pos_and_mat(site_names: list[str]) -> dict
def query_site_size(site_names: list[str]) -> dict[str, np.ndarray]
def query_sensor_data(sensor_names: list[str]) -> dict[str, np.ndarray]
def query_actuator_torques(actuator_names: list[str]) -> dict[str, np.ndarray]
def query_contact_simple() -> list[dict]
def query_contact_force(contact_ids: list[int]) -> dict[int, np.ndarray]
def get_cfrc_ext() -> np.ndarray
def get_goal_bounding_box(geom_name: str) -> np.ndarray
def body_subtree_mass(body_name: str) -> float
def geom_friction(geom_name: str) -> np.ndarray
```

### 力应用委托

```python
def apply_body_force(body_id: int, force: np.ndarray, torque: np.ndarray) -> None
def clear_body_force(body_id: int) -> None
def clear_all_forces() -> None
def mj_apply_force_at_site(site_id: int, force: np.ndarray, torque: np.ndarray) -> None
def mj_clear_xfrc_applied_for_site(site_id: int) -> None
```

### 状态设置委托

```python
def set_mocap_pos_and_quat(mocap_dict: dict[str, dict]) -> None
async def set_mocap_pos_and_quat_remote(mocap_data: dict, send_remote: bool = False) -> None
def set_geom_friction(geom_friction_dict: dict[str, np.ndarray]) -> None
def add_extra_weight(weight_load_dict: dict) -> None
```

### 雅可比委托

```python
def mj_jacBody(jacp: np.ndarray, jacr: np.ndarray, body_id: int) -> None
def mj_jacSite(jacp: np.ndarray, jacr: np.ndarray, site_id: int) -> None
def mj_jac_site(site_names: list[str]) -> dict[str, dict]
```

### 等式约束委托

```python
def update_equality_constraints(eq_list: list[dict]) -> None
def modify_equality_objects(eq_ids: list[int], obj1_ids=None, obj2_ids=None) -> None
def equality_data_width() -> int
def equality_object_ids(eq_idx: int) -> tuple[int, int]
def n_equality() -> int
def mocap_body_names() -> list[str]
```

### Studio 桥接与交互

```python
def studio_bridge(self) -> OrcaStudioBridge
```
**方法**而非 property（K9 约束），防止 `gym.studio` 式穿墙。仅 Env 在初始化时调用一次取引用。

```python
async def render() -> None
async def pause_simulation() -> None
async def begin_save_video(file_path: str, capture_mode) -> None
async def stop_save_video() -> None
async def get_current_frame() -> int
async def get_camera_time_stamp(last_frame_index: int) -> dict
async def get_frame_png(image_path: str) -> None
async def load_content_file(content_file_name: str, **kwargs) -> None
async def get_body_manipulation_state() -> dict
```

### 生命周期

```python
async def init_simulation(model_xml_path: str) -> None
```
初始化仿真：加载模型 → 绑定 SimConfig/ModelRegistry 到真实 mjModel → 缓存 OrcaGymModel → 首次同步 DataView。

```python
async def load_model_xml() -> str
```
加载模型 XML（在线模式从 Studio 拉取，离线模式返回本地路径）。

---

## SimConfig（求解器参数配置，新）

位于 `orca_gym/core/euler/sim_config.py`。提供 typed 的 MuJoCo 求解器参数读写接口，**替代直接访问 `_mjModel.opt.*`**。修改在下次 `mj_step` 时生效。

### 构造

```python
class SimConfig:
    def __init__(self, mj_model=None)
```
`mj_model` 为 `None` 时使用缓存默认值（`init_simulation` 前状态）。`_bind(mj_model)` 后委托真实 `mj_model.opt.*`。

### Property（与老体系 opt 的迁移映射）

| 新接口 | 旧接口（禁止） | 类型 |
|--------|--------------|------|
| `env.sim_config.timestep` | `gym._mjModel.opt.timestep` | `float` |
| `env.sim_config.integrator` | `gym._mjModel.opt.integrator` | `int` |
| `env.sim_config.iterations` | `gym._mjModel.opt.iterations` | `int` |
| `env.sim_config.gravity` | `gym._mjModel.opt.gravity` | `np.ndarray(3,)` |

### 批量方法

```python
def load_from_dict(config: dict) -> None
```
从字典批量加载配置。键为 `"timestep"`/`"integrator"`/`"iterations"`/`"gravity"`。

```python
def to_dict() -> dict
```
导出当前配置为字典。

### 使用示例

```python
# 正确 —— Euler 体系
env.sim_config.timestep = 0.002
env.sim_config.iterations = 100
env.sim_config.load_from_dict({"integrator": 0, "iterations": 100})

# 禁止 —— Euler 体系下这会触发 ruff SLF001 报警（违反 P2）
# env._gym._sim._mjModel.opt.timestep = 0.002
```

---

## OrcaGymDataView（完整状态只读视图，新）

位于 `orca_gym/core/euler/orca_gym_data_view.py`。提供 MuJoCo 状态的**完整只读视图**，**替代直接访问 `_mjData`**。所有字段在 `sync_to_view()` 后保证一致。

### 基本状态字段

```python
qpos: np.ndarray       # (nq,)  广义坐标（零拷贝视图）
qvel: np.ndarray       # (nv,)  广义速度（零拷贝视图）
qacc: np.ndarray       # (nv,)  广义加速度
qfrc_bias: np.ndarray  # (nv,)  偏置力（重力+科氏力+离心力）
time: float            # 仿真时间（秒）
```

### 扩展字段（覆盖老体系绕道访问需求）

```python
xfrc_applied: np.ndarray    # 外力（只读视图，写入用 apply_body_force）
actuator_force: np.ndarray  # 执行器力
contact: list               # 接触列表
cfrc_ext: np.ndarray        # 外部约束力 (nbody, 6)
```

### Body 查询方法（按名称，无需 id）

```python
def body_xpos(body_name: str) -> np.ndarray       # 世界坐标位置 (3,)
def body_xquat(body_name: str) -> np.ndarray      # 四元数 [w,x,y,z] (4,)
def body_xmat(body_name: str) -> np.ndarray       # 旋转矩阵扁平存储 (9,)
def body_cvel(body_name: str) -> np.ndarray       # 空间速度 [ang(3), lin(3)] (6,)
def body_subtree_mass(body_name: str) -> float    # 子树总质量（标量）
```

### Site 查询方法

```python
def site_xpos(site_name: str) -> np.ndarray       # 世界坐标位置 (3,)
def site_xmat(site_name: str) -> np.ndarray       # 旋转矩阵扁平存储 (9,)
```

### Geom 查询方法

```python
def geom_xpos(geom_name: str) -> np.ndarray       # 世界坐标位置 (3,)
def geom_xmat(geom_name: str) -> np.ndarray       # 旋转矩阵扁平存储 (9,)
def geom_size(geom_name: str) -> np.ndarray       # 尺寸 (3,)
```

### Mocap 查询方法

```python
def mocap_pos(body_name: str) -> np.ndarray       # mocap 位置 (3,)
def mocap_quat(body_name: str) -> np.ndarray      # mocap 四元数 [w,x,y,z] (4,)
```

### 与老体系 Data 的迁移映射

| 新 API（Euler） | 旧代码（禁止） |
|----------------|---------------|
| `env.data.qpos` | `gym._mjData.qpos` |
| `env.data.qvel` | `gym._mjData.qvel` |
| `env.data.body_xpos("link1")` | `gym._mjData.body(id).xpos` |
| `env.data.body_cvel("link1")` | `gym._mjData.cvel[id]` |
| `env.data.xfrc_applied`（只读） | `gym._mjData.xfrc_applied`（读写） |
| `env.data.time` | `gym._mjData.time` |

---

## MuJoCoSimCore（仿真核心，新）

位于 `orca_gym/core/euler/mujoco_sim_core.py`。持有 `_mjModel`/`_mjData`，这是 MuJoCo 原生数据结构的**唯一存放位置**。所有 MuJoCo 原生操作集中于此。

**关键设计：** `_mjModel`/`_mjData` 只存在于此类内部，不对外暴露。外部通过 `sync_to_view()` 将状态同步到 `OrcaGymDataView`。

```python
class MuJoCoSimCore:
    def __init__(self)
    def init_simulation(model_xml_path: str) -> None
    def step(nstep: int) -> None
    def forward() -> None
    def set_ctrl(ctrl: np.ndarray) -> None
    def set_qpos_qvel(qpos: np.ndarray, qvel: np.ndarray) -> None
    def reset_data() -> None
    def sync_to_view(view: OrcaGymDataView) -> None

    # 力应用
    def apply_body_force(body_id: int, force: np.ndarray, torque: np.ndarray) -> None
    def clear_body_force(body_id: int) -> None
    def clear_all_forces() -> None
    def mj_apply_force_at_site(site_id: int, force: np.ndarray, torque: np.ndarray) -> None
    def mj_clear_xfrc_applied_for_site(site_id: int) -> None

    # 雅可比
    def mj_jacBody(jacp: np.ndarray, jacr: np.ndarray, body_id: int) -> None
    def mj_jacSite(jacp: np.ndarray, jacr: np.ndarray, site_id: int) -> None
    def mj_jac_site(site_names: list[str]) -> dict[str, dict]

    # 状态设置
    def set_mocap_pos_and_quat(mocap_dict: dict) -> None
    def set_geom_friction(geom_friction_dict: dict) -> None
    def add_extra_weight(weight_load_dict: dict) -> None

    # 等式约束
    def update_equality_constraints(eq_list: list[dict]) -> None
    def modify_equality_objects(eq_ids: list[int], obj1_ids=None, obj2_ids=None) -> None

    # 维度
    @property nq -> int
    @property nv -> int
    @property nu -> int
```

---

## OrcaGymBase（老体系，维护模式）

位于 `orca_gym/core/orca_gym.py`。老体系 gRPC 基础封装，是 `OrcaGymLocal` 的基类。通常不直接使用。

### 属性

```python
class OrcaGymBase:
    stub: GrpcServiceStub       # gRPC 客户端存根
    model: OrcaGymModel | None  # 模型信息
    data: OrcaGymData | None    # 动态状态
    opt: OrcaGymOptConfig | None # 优化配置
```

### 异步方法

```python
async def pause_simulation()
async def set_qpos(qpos: np.ndarray)
async def set_qvel(qvel: np.ndarray)
async def mj_forward()
async def mj_inverse()
async def mj_step(nstep: int)
```

### 调试方法

```python
def print_opt_config()
def print_model_info(model_info: dict)
```

---

## OrcaGymLocal（老体系，维护模式）

位于 `orca_gym/core/orca_gym_local.py`。老体系本地 MuJoCo backend，封装了本地 MuJoCo 模型和数据的完整操作。

> ⚠️ **注意**：此类是老体系核心类，直接暴露 `_mjModel`/`_mjData` 为公共属性。新项目推荐使用 `OrcaGymEuler` 体系。

### 构造

```python
def __init__(
    self,
    stub,
    *,
    skip_grpc_load: bool = False,
    local_xml_path: str | None = None,
    xml_assets_dir: str | None = None,
)
```

### 初始化流程

```python
gym = OrcaGymLocal(stub)
model_xml_path = await gym.load_model_xml()
await gym.init_simulation(model_xml_path)
```

### 属性

```python
@property xml_file_dir -> str        # 资源缓存目录
```

### 模型加载

```python
async def load_model_xml() -> str
async def init_simulation(model_xml_path: str)
async def load_content_file(content_file_name, remote_file_dir="", local_file_dir="", temp_file_path=None) -> str
```

### 仿真控制

```python
def set_ctrl(ctrl: np.ndarray)           # 设置控制输入
def mj_step(nstep: int)                  # 物理步进
def mj_forward()                         # 前向计算
def mj_inverse()                         # 逆动力学
def update_data()                        # 同步 _mjData → self.data
def update_data_external(qpos, qvel, qacc, qfrc_bias, time)  # 外部数据注入
def load_initial_frame()                 # 重置到初始状态
def set_time_step(time_step: float)      # 设置时间步长
```

### 模型信息查询（初始化时调用，返回的字典由 OrcaGymModel 消费）

```python
def query_model_info() -> dict           # 维度信息
def query_all_bodies() -> dict           # 所有 body 信息
def query_all_joints() -> dict           # 所有 joint 信息
def query_all_actuators() -> dict        # 所有 actuator 信息
def query_all_geoms() -> dict            # 所有 geom 信息
def query_all_sites() -> dict            # 所有 site 信息
def query_all_sensors() -> dict          # 所有 sensor 信息
def query_all_meshes() -> dict           # 所有 mesh 信息
def query_all_equality_constraints() -> list  # 所有等式约束
def query_all_mocap_bodies() -> dict     # 所有 mocap body
```

### 状态查询

#### Body 位姿与速度

```python
def query_body_xpos_xmat_xquat(body_name_list: list[str]) -> dict
```
返回 `{body_name: {"Pos": array(3,), "Mat": array(9,), "Quat": array(4,)}}`。

```python
def query_body_xpos_xmat_xquat_xvel(body_name_list: list[str]) -> dict
```
比上面多 `LinVel` 字段。

#### 关节状态

```python
def query_joint_qpos(joint_names: list[str]) -> dict      # 关节位置
def query_joint_qvel(joint_names: list[str]) -> dict      # 关节速度
def query_joint_qacc(joint_names: list[str]) -> dict      # 关节加速度
def query_joint_offsets(joint_names: list[str]) -> tuple  # 偏移量
def query_joint_lengths(joint_names: list[str]) -> tuple  # 长度
def jnt_qposadr(joint_name: str) -> int                   # qpos 起始地址
def jnt_dofadr(joint_name: str) -> int                    # qvel 起始地址
def query_joint_dofadrs(joint_names: list[str]) -> dict   # 批量 DOF 地址
```

#### Site 位姿

```python
def query_site_pos_and_mat(site_names: list[str]) -> dict  # {site_name: {"xpos", "xmat"}}
def query_site_size(site_names: list[str]) -> dict         # {site_name: size_array}
```

#### 传感器/执行器/力

```python
def query_sensor_data(sensor_names: list[str]) -> dict
def query_actuator_torques(actuator_names: list[str]) -> dict
def get_cfrc_ext() -> np.ndarray          # 外部约束力 (nbody, 6)
def query_qfrc_bias() -> np.ndarray       # 偏置力 (nv,)
```

### 状态设置

```python
def set_joint_qpos(joint_qpos: dict)      # 按关节名设置 qpos
def set_joint_qvel(joint_qvel: dict)      # 按关节名设置 qvel
```

### 动力学计算

```python
def mj_fullM() -> np.ndarray              # 质量矩阵 (nv, nv)
def mj_jacBody(jacp, jacr, body_id)       # body 雅可比
def mj_jacSite(jacp, jacr, site_id)       # site 雅可比
def mj_jac_site(site_names: list[str]) -> dict  # 批量 site 雅可比
def mj_apply_force_at_site(site_name, force, torque)  # site 处施力
def mj_clear_xfrc_applied_for_site(site_name)  # 清 site xfrc
```

### 接触信息

```python
def query_contact_simple() -> list           # 接触列表
def query_contact_force(contact_ids) -> dict # 接触力
def get_contact_sources() -> dict            # 接触源统计
```

### 等式约束与 Mocap

```python
def modify_equality_objects(old_obj1_id, old_obj2_id, new_obj1_id, new_obj2_id)
def update_equality_constraints(constraint_list)
async def set_mocap_pos_and_quat(mocap_data, send_remote=False)
```

### 执行器/几何体配置

```python
def set_actuator_trnid(actuator_id, trnid)
def disable_actuator(actuator_groups)
def set_geom_friction(geom_friction_dict)
def add_extra_weight(weight_load_dict)
def get_goal_bounding_box(goal_body_name) -> dict
```

### 基座坐标系查询

```python
def query_velocity_body_B(ee_body, base_body) -> np.ndarray    # 6D 速度
def query_position_body_B(ee_body, base_body) -> np.ndarray    # 3D 位置
def query_orientation_body_B(ee_body, base_body) -> np.ndarray # 四元数
def query_joint_axes_B(joint_names, base_body) -> dict         # 关节轴方向
```

### 里程计查询

```python
def query_robot_velocity_odom(base_body, initial_base_pos, initial_base_quat) -> tuple
def query_robot_position_odom(base_body, initial_base_pos, initial_base_quat) -> np.ndarray
def query_robot_orientation_odom(base_body, initial_base_pos, initial_base_quat) -> np.ndarray
```

### Opt 配置

```python
def set_opt_timestep(timestep: float)
async def set_timestep_remote(timestep: float)
def query_opt_config() -> dict
def set_opt_config()
```

### 视频录制

```python
async def begin_save_video(file_path: str, capture_mode = CaptureMode.ASYNC)
async def stop_save_video()
async def get_current_frame() -> int
async def get_camera_time_stamp(last_frame: int) -> dict
async def get_frame_png(image_path: str) -> dict
```

### 渲染与 UI 交互

```python
async def render()
async def update_local_env(qpos: np.ndarray, time: float)
async def get_body_manipulation_anchored() -> tuple
async def get_body_manipulation_movement() -> dict
```

### 性能分析

```python
def get_timer_stats() -> dict
def get_constraint_counts() -> dict
def log_profile(label: str = "")
```

---

## OrcaGymModel（动态模型信息，两套体系共用）

位于 `orca_gym/core/orca_gym_model.py`。静态模型信息容器，管理名称↔ID 映射和结构查询。两套体系**原样复用**。

### 维度属性

```python
nq: int        # qpos 长度
nv: int        # qvel/qacc 长度（自由度数）
nu: int        # 执行器数量
ngeom: int     # 几何体数量
neq: int       # 等式约束数量
nmocap: int    # mocap body 数量
```

### 实体类型术语

| 实体 | 说明 |
|------|------|
| **Body** | 刚体，物理仿真基本单元。有质量、惯性、位置、姿态。 |
| **Joint** | 关节，连接 body 的约束。定义相对运动（旋转/滑动/自由）。 |
| **Actuator** | 执行器，驱动机器人的元件（电机等）。对应动作空间维度。 |
| **Geom** | 几何体，用于碰撞检测的几何形状。 |
| **Site** | 标记点，不参与物理仿真。用于标记关键位置。 |
| **Sensor** | 传感器，测量物理量的虚拟设备。 |
| **Equality** | 等式约束，强制两个 body 满足特定关系。常用于抓取。 |
| **Mocap Body** | 虚拟 body，可自由移动，不受物理约束。 |

### 初始化方法
由 Backend 在 `init_simulation()` 中调用：

```python
def init_model_info(model_info: dict)
def init_body_dict(body_dict: dict)
def init_joint_dict(joint_dict: dict)
def init_actuator_dict(actuator_dict: dict)
def init_geom_dict(geom_dict: dict)
def init_site_dict(site_dict: dict)
def init_sensor_dict(sensor_dict: dict)
def init_mesh_dict(mesh_dict: dict)
def init_eq_list(eq_list: list)
def init_mocap_dict(mocap_dict: dict)
```

### 名称↔ID 映射

| 实体 | `name2id` | `id2name` | 获取全部 |
|------|-----------|-----------|---------|
| Body | `body_name2id(n)` | `body_id2name(i)` | `get_body_dict()` |
| Joint | `joint_name2id(n)` | `joint_id2name(i)` | `get_joint_dict()` |
| Actuator | `actuator_name2id(n)` | `actuator_id2name(i)` | `get_actuator_dict()` |
| Geom | `geom_name2id(n)` | `geom_id2name(i)` | `get_geom_dict()` |
| Site | `site_name2id(n)` | `site_id2name(i)` | `get_site_dict()` |
| Sensor | `sensor_name2id(n)` | `sensor_id2name(i)` | `gen_sensor_dict()` |
| Mesh | `mesh_name2id(n)` | `mesh_id2name(i)` | `get_mesh_dict()` |

### 其他查询

```python
def get_body_names()
def get_actuator_ctrlrange() -> np.ndarray    # (nu, 2) 控制范围
def get_joint_qposrange(joint_names) -> np.ndarray
def get_eq_list() -> list
def get_mocap_dict() -> dict
def get_geom_body_name(geom_id: int) -> str
def get_geom_body_id(geom_id: int) -> int
```

### Flex Body 方法

```python
def resolve_flex_body_name(body_name: str) -> FlexBodyInfo | None
def is_flex_body(body_name: str) -> bool
def parse_flex_vertex_name(body_name: str) -> tuple[str, int] | None
def get_flex_info_by_body_id(body_id: int) -> tuple[int, int] | None
```

### FlexBodyInfo 数据类

```python
@dataclass
class FlexBodyInfo:
    original_name: str
    actual_body_name: str
    flex_type: Literal["normal", "vertex", "trilinear", "quadratic"]
    flex_name: str | None
    vertex_index: int | None
```

---

## OrcaGymData（老体系动态状态，维护模式）

位于 `orca_gym/core/orca_gym_data.py`。老体系动态仿真状态容器。

> ⚠️ **注意**：仅包含 5 个字段（不完整），新项目推荐使用 `OrcaGymDataView`（完整只读视图）。

### 属性

```python
qpos: np.ndarray       # (nq,)  广义坐标
qvel: np.ndarray       # (nv,)  广义速度
qacc: np.ndarray       # (nv,)  广义加速度
qfrc_bias: np.ndarray  # (nv,)  偏置力
time: float            # 仿真时间（秒）
```

### 更新方法

```python
def update_qpos_qvel_qacc(qpos, qvel, qacc)
def update_qfrc_bias(qfrc_bias)
```

---

## OrcaGymOptConfig（老体系 opt 配置，维护模式）

位于 `orca_gym/core/orca_gym_opt_config.py`。老体系 MuJoCo 物理引擎优化器配置快照。

> ⚠️ **注意**：新项目推荐使用 `SimConfig`（typed property，替代直接访问 `opt.*`）。

### 全部字段

```python
class OrcaGymOptConfig:
    # 时间
    timestep: float
    # 求解器
    integrator: int; cone: int; jacobian: int; solver: int
    iterations: int; ls_iterations: int; noslip_iterations: int
    ccd_iterations: int; sdf_iterations: int
    # 容差
    tolerance: float; ls_tolerance: float; noslip_tolerance: float
    ccd_tolerance: float; impratio: float
    # 物理环境
    gravity: list[float]; wind: list[float]; magnetic: list[float]
    density: float; viscosity: float
    # 接触
    o_margin: float; o_solref: list[float]; o_solimp: list[float]; o_friction: list[float]
    # 标志位
    disableflags: int; enableflags: int; disableactuator: int; filterparent: bool
    # SDF
    sdf_initpoints: int
```

---

## 辅助枚举与函数

位于 `orca_gym/core/orca_gym_local.py`。

### AnchorType

```python
class AnchorType:
    NONE = 0   # 无锚定
    WELD = 1   # 焊接锚定（完全固定位置和姿态）
    BALL = 2   # 球关节锚定（固定位置，允许旋转）
```

### CaptureMode

```python
class CaptureMode:
    ASYNC = 0  # 异步视频捕获
    SYNC = 1   # 同步视频捕获
```

### 工具函数

```python
def get_qpos_size(joint_type: int) -> int  # 关节在 qpos 中的元素数
def get_dof_size(joint_type: int) -> int   # 关节自由度数
def get_eq_type(anchor_type: AnchorType) -> int  # AnchorType → MuJoCo 等式约束类型
```
