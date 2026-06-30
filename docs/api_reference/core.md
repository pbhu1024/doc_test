# 🧬 Core API

核心仿真接口，位于 `orca_gym/core/`。这是 OrcaGym 最底层的 API，封装了 MuJoCo 物理引擎和 gRPC 通信。

## 架构概览

```
OrcaGymBase (gRPC 基础封装)
  └── OrcaGymLocal (本地 MuJoCo backend)
        ├── _mjModel: mujoco.MjModel     # 原始 MuJoCo 模型
        ├── _mjData:  mujoco.MjData      # 原始 MuJoCo 数据
        ├── model:    OrcaGymModel       # 封装后的模型
        ├── data:     OrcaGymData        # 封装后的状态
        └── opt:      OrcaGymOptConfig   # MuJoCo 优化配置
```

**核心字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `_mjModel` | `mujoco.MjModel` | 原始 MuJoCo 模型，包含全部静态信息（几何、质量、约束等） |
| `_mjData` | `mujoco.MjData` | 原始 MuJoCo 数据，包含全部动态状态（位置、速度、力等） |
| `model` | `OrcaGymModel` | 封装后的模型对象，提供名称↔ID 映射等便捷接口 |
| `data` | `OrcaGymData` | 封装后的状态对象，包含 qpos/qvel/qacc/qfrc_bias/time |
| `opt` | `OrcaGymOptConfig` | MuJoCo 优化器配置（时间步长、求解器、重力等） |

## 顶层导出

```python
from orca_gym import (
    OrcaGymBase,        # gRPC 基础封装（OrcaGymLocal 的基类）
    OrcaGymModel,       # 静态模型信息
    OrcaGymData,        # 动态仿真状态
    OrcaGymOptConfig,   # MuJoCo opt 配置
    OrcaGymLocal,       # 本地 MuJoCo backend（用户最常使用的类）
)
```

---

## OrcaGymBase

位于 `orca_gym/core/orca_gym.py`。基类，封装最基础的 gRPC 调用能力，是 `OrcaGymLocal` 的基类。通常不直接使用。

### 属性

```python
class OrcaGymBase:
    stub: GrpcServiceStub       # gRPC 客户端存根（可为 None）
    model: OrcaGymModel | None  # 模型信息（初始化后填充）
    data: OrcaGymData | None    # 动态状态（初始化后填充）
    opt: OrcaGymOptConfig | None # 优化配置（初始化后填充）
```

### 异步方法

所有异步方法需要在 `async` 函数中通过 `await` 调用，通过 gRPC 与服务端通信。

```python
async def pause_simulation()
```
将服务端仿真状态设为 PAUSED（暂停）。OrcaGym 采用"被动模式"：服务端默认暂停，由 Gym 的 `step()` 主动驱动。

```python
async def set_qpos(qpos: np.ndarray)
```
设置全局广义坐标（远程调用）。`qpos` 形状 `(nq,)`。

```python
async def set_qvel(qvel: np.ndarray)
```
设置全局广义速度（远程调用）。`qvel` 形状 `(nv,)`。

```python
async def mj_forward()
```
执行 MuJoCo 前向计算（远程调用）。更新运动学、传感器等派生量。

```python
async def mj_inverse()
```
执行 MuJoCo 逆动力学计算（远程调用）。

```python
async def mj_step(nstep: int)
```
执行 `nstep` 次物理步进（远程调用）。每次步进时间为 `opt.timestep`。

### 调试方法

```python
def print_opt_config()
```
打印当前优化配置（timestep、solver、iterations、gravity 等）。

```python
def print_model_info(model_info: dict)
```
打印模型维度信息（nq、nv、nu、nbody、njnt、ngeom 等）。

---

## OrcaGymLocal

位于 `orca_gym/core/orca_gym_local.py`。**用户最常使用的核心类**，封装了本地 MuJoCo 模型和数据的完整操作。通过 gRPC 与 OrcaSim 服务器通信。

### 构造

```python
def __init__(
    self,
    stub,                               # gRPC 客户端存根（离线模式可为 None）
    *,
    skip_grpc_load: bool = False,       # True → 跳过 gRPC，使用本地 XML
    local_xml_path: str | None = None,  # 本地 MJCF XML 路径（配合 skip_grpc_load）
    xml_assets_dir: str | None = None,  # mesh/hfield 等资源目录（默认取 XML 所在目录）
)
```

- `skip_grpc_load=True` 配合 `local_xml_path` 使用离线模式，无需启动 OrcaSim 服务器。
- `xml_assets_dir` 默认取 `local_xml_path` 所在目录。

### 初始化流程

典型的初始化顺序：

```python
# 1. 创建
gym = OrcaGymLocal(stub)

# 2. 加载模型 XML（从服务端拉取或使用本地文件）
model_xml_path = await gym.load_model_xml()

# 3. 初始化 MuJoCo 仿真（创建 MjModel/MjData + 所有模型容器）
await gym.init_simulation(model_xml_path)

# 4. 之后即可访问
print(gym.model.nq, gym.model.nv, gym.model.nu)
print(gym.data.qpos, gym.data.qvel)
print(gym.opt.timestep)
```

---

### 属性

```python
@property xml_file_dir -> str
```
资源缓存目录，默认 `~/.orcagym/tmp`；离线模式下为 `xml_assets_dir`。目录不存在会自动创建。

---

### 模型加载

```python
async def load_model_xml() -> str
```
从服务端获取模型 XML 和所需资源文件（mesh、hfield 等），返回本地 XML 绝对路径。使用文件锁和原子写入防止多进程冲突。如果构造时指定了 `local_xml_path`，直接使用本地文件。

```python
async def init_simulation(model_xml_path: str)
```
从 XML 文件构建 `_mjModel` / `_mjData`，初始化所有模型信息容器（body、joint、actuator、geom、site、sensor、mesh、equality、mocap），创建 `model` / `data` / `opt` 包装对象。

```python
async def load_content_file(
    content_file_name: str,
    remote_file_dir: str = "",
    local_file_dir: str = "",
    temp_file_path: str | None = None,
) -> str
```
下载单个资源文件到本地缓存。使用文件锁 + 原子写入（先写临时文件，再移动到最终位置），防止多进程冲突和文件损坏。文件已存在时跳过下载。

---

### 仿真控制

以下为本地同步方法，直接操作 `_mjModel` / `_mjData`。

```python
def set_ctrl(ctrl: np.ndarray)
```
设置执行器控制输入，形状 `(nu,)`。如果存在控制覆盖（来自 UI 手动控制），会自动覆盖对应执行器的值。

```python
def mj_step(nstep: int)
```
执行 `nstep` 次物理仿真步进。每次步进的时间为 `opt.timestep`。调用前先设置控制输入。

```python
def mj_forward()
```
前向计算：更新位置、速度、加速度、传感器等全部派生量。在手动修改 `qpos`/`qvel`/mocap 后**必须调用**。

```python
def mj_inverse()
```
逆动力学计算：根据当前加速度反算所需力/力矩，结果存入 `_mjData.qfrc_actuator`。

```python
def update_data()
```
将 `_mjData` 的最新状态（qpos、qvel、qacc、qfrc_bias、time）同步到封装的 `self.data` 中。

```python
def update_data_external(
    qpos: np.ndarray,
    qvel: np.ndarray,
    qacc: np.ndarray,
    qfrc_bias: np.ndarray,
    time: float,
)
```
从外部来源更新 `self.data`，不涉及 `_mjData` 同步。用于与外部仿真器协作的特殊场景。

```python
def load_initial_frame()
```
调用 MuJoCo 的 `mj_resetData` 将仿真重置到初始状态。在环境 `reset()` 时使用。

```python
def set_time_step(time_step: float)
```
同时设置本地 `_mjModel.opt.timestep` 和内部缓存的 `_timestep`。

---

### 模型信息查询

以下方法读取 `_mjModel` 的**静态**信息，通常只在 `init_simulation` 时调用一次。返回的字典由 `OrcaGymModel` 的 `init_*` 方法消费。

```python
def query_model_info() -> dict
```
返回维度信息，包含：`nq`, `nv`, `nu`, `nbody`, `njnt`, `ngeom`, `nsite`, `nmesh`, `ncam`, `nlight`, `nconmax`, `nuser_body`, `nuser_jnt`, `nuser_geom`, `nuser_site`, `nuser_tendon`, `nuser_actuator`, `nuser_sensor`，以及 flex 相关字段（`nflex`, `nflexvert`, `flex_vertbodyid`, `flex_vertadr`, `flex_vertnum`, `flex_names`）。

```python
def query_all_bodies() -> dict
```
返回 `{body_name: {"ID", "ParentID", "RootID", "WeldID", "MocapID", "JntNum", "JntAdr", "DofNum", "DofAdr", "TreeID", "GeomNum", "GeomAdr", "Simple", "SameFrame", "Pos", "Quat", "IPos", "IQuat", "Mass", "SubtreeMass", "Inertia", "InvWeight", "GravComp", "Margin"}}`。

```python
def query_all_joints() -> dict
```
返回 `{joint_name: {"ID", "BodyID", "Type", "Range", "QposIdxStart", "QvelIdxStart", "Group", "Limited", "ActfrcLimited", "Solref", "Solimp", "Pos", "Axis", "Stiffness", "ActfrcRange", "Margin", "Frictionloss", "Damping"}}`。

```python
def query_all_actuators() -> dict
```
返回 `{actuator_name: {"JointName", "GearRatio", "TrnId", "CtrlLimited", "ForceLimited", "ActLimited", "CtrlRange", "ForceRange", "ActRange", "TrnType", "DynType", "GainType", "BiasType", "ActAdr", "ActNum", "Group", "DynPrm", "GainPrm", "BiasPrm", "ActEarly", "Gear", "CrankLength", "Acc0", "Length0", "LengthRange"}}`。

```python
def query_all_geoms() -> dict
```
返回 `{geom_name: {"BodyName", "Type", "Contype", "Conaffinity", "Condim", "Solmix", "Solref", "Solimp", "Size", "Friction", "DataID", "MatID", "Group", "Priority", "Plugin", "SameFrame", "Pos", "Quat", "Margin", "Gap"}}`。

```python
def query_all_sites() -> dict
```
返回 `{site_name: {"ID", "BodyID", "Type", "Pos", "Mat", "LocalPos", "LocalQuat", "Size", "User"}}`。

```python
def query_all_sensors() -> dict
```
返回 `{sensor_name: {"ID", "Type", "ObjID", "Dim", "Adr", "Noise"}}`。Type 会被映射为可读字符串（accelerometer、gyro、touch、velocimeter、framequat 等）。

```python
def query_all_meshes() -> dict
```
返回 `{mesh_name: {"ID", "File", "Scale"}}`。File 路径通过解析 XML 获得（MuJoCo Python API 不直接暴露 mesh 文件路径）。

```python
def query_all_equality_constraints() -> list
```
返回所有等式约束的列表，每项 `{"eq_type", "obj1_id", "obj2_id", "active", "eq_solref", "eq_solimp", "eq_data"}`。

```python
def query_all_mocap_bodies() -> dict
```
返回 `{mocap_body_name: mocap_id}`。筛选条件为 `body_mocapid != -1`。

---

### 状态查询

以下方法读取 `_mjData` 的**动态**状态。

#### Body 位姿与速度

```python
def query_body_xpos_xmat_xquat(body_name_list: list[str]) -> dict
```
返回 `{body_name: {"Pos": array(3,), "Mat": array(9,), "Quat": array(4,)}}`。
- **Pos**: 世界坐标系中的位置 `[x, y, z]`
- **Mat**: 3×3 旋转矩阵按行展开为 9 个元素
- **Quat**: 四元数 `[w, x, y, z]`（MuJoCo 格式）

```python
def query_body_xpos_xmat_xquat_xvel(body_name_list: list[str]) -> dict
```
比上面多一个 `LinVel` 字段——body 原点在世界系中的线速度（通过 `mj_jacBody @ qvel` 计算）。

#### 关节状态

```python
def query_joint_qpos(joint_names: list[str]) -> dict
```
关节位置字典。数组长度取决于关节类型：HINGE/SLIDE=1，BALL=4，FREE=7。

```python
def query_joint_qvel(joint_names: list[str]) -> dict
```
关节速度字典。数组长度取决于自由度：HINGE/SLIDE=1，BALL=3，FREE=6。

```python
def query_joint_qacc(joint_names: list[str]) -> dict
```
关节加速度字典，格式同 `query_joint_qvel`。

```python
def query_joint_offsets(joint_names: list[str]) -> tuple
```
返回 `(qpos_offsets, qvel_offsets, qacc_offsets)`，每个为 int 列表。offsets 是关节在全局数组中的起始索引。

```python
def query_joint_lengths(joint_names: list[str]) -> tuple
```
返回 `(qpos_lengths, qvel_lengths, qacc_lengths)`，每个为 int 列表。lengths 是关节状态在全局数组中的元素数。

```python
def jnt_qposadr(joint_name: str) -> int
```
单关节在 `qpos` 数组中的起始地址。

```python
def jnt_dofadr(joint_name: str) -> int
```
单关节在 `qvel/qacc` 数组中的起始地址。

```python
def query_joint_dofadrs(joint_names: list[str]) -> dict
```
批量查询 DOF 地址，返回 `{joint_name: dof_adr}`。

#### Site 位姿

```python
def query_site_pos_and_mat(site_names: list[str]) -> dict
```
返回 `{site_name: {"xpos": array(3,), "xmat": array(9,)}}`。

```python
def query_site_size(site_names: list[str]) -> dict
```
返回 `{site_name: size_array}`。尺寸含义取决于 site 类型。

#### 传感器

```python
def query_sensor_data(sensor_names: list[str]) -> dict
```
返回 `{sensor_name: data_array}`。从 `_mjData.sensordata` 按传感器的 Adr/Dim 提取。

#### 执行器

```python
def query_actuator_torques(actuator_names: list[str]) -> dict
```
返回 `{actuator_name: torque_array(6,)}`。考虑齿轮比后的实际扭矩值。

#### 力与偏置

```python
def get_cfrc_ext() -> np.ndarray
```
所有 body 的外部约束力，形状 `(nbody, 6)`。每行 `[fx, fy, fz, mx, my, mz]`。返回值是 `copy()`，修改不影响原始数据。

```python
def query_qfrc_bias() -> np.ndarray
```
偏置力 `(nv,)`，包含重力、科里奥利力、离心力等被动力。

---

### 状态设置

```python
def set_joint_qpos(joint_qpos: dict)
```
按关节名称设置 `qpos`。传入 `{joint_name: qpos_array}`。数组长度必须匹配关节类型。修改后需调用 `mj_forward()`。

```python
def set_joint_qvel(joint_qvel: dict)
```
按关节名称设置 `qvel`。传入 `{joint_name: qvel_array}`。修改后需调用 `mj_forward()`。

---

### 动力学计算

```python
def mj_fullM() -> np.ndarray
```
计算完整质量矩阵 `(nv, nv)`。用于逆动力学、力控制等算法。

```python
def mj_jacBody(jacp: np.ndarray, jacr: np.ndarray, body_id: int)
```
计算 body 的雅可比矩阵，结果输出到 `jacp` 和 `jacr`（需预先分配，各 `(3, nv)`）。将关节速度映射到 body 的线速度/角速度。

```python
def mj_jacSite(jacp: np.ndarray, jacr: np.ndarray, site_id: int)
```
计算 site 的雅可比矩阵，用法同 `mj_jacBody`。

```python
def mj_jac_site(site_names: list[str]) -> dict
```
批量计算 site 雅可比，返回 `{site_name: {"jacp": array(3,nv), "jacr": array(3,nv)}}`。

```python
def mj_apply_force_at_site(
    site_name: str,
    force: np.ndarray,    # [fx, fy, fz] 世界系
    torque: np.ndarray,   # [tx, ty, tz] 世界系
)
```
在指定 site 处施加外力和外力矩。通过计算力臂（r × F）将 site 作用力等效转换到 body 质心，写入 `_mjData.xfrc_applied`。

```python
def mj_clear_xfrc_applied_for_site(site_name: str)
```
清零指定 site 所属 body 的 `xfrc_applied`。用于实现脉冲力（每帧清零，避免累积）。

---

### 接触信息

```python
def query_contact_simple() -> list
```
返回当前所有接触点列表，每项 `{"ID": int, "Dim": int, "Geom1": int, "Geom2": int}`。只包含有效接触（geom1 ≥ 0 且 geom2 ≥ 0）。

```python
def query_contact_force(contact_ids: list[int]) -> dict
```
返回 `{contact_id: force_array(6,)}`。6 维向量前 3 个为线性力 `[fx, fy, fz]`，后 3 个为力矩 `[mx, my, mz]`。

```python
def get_contact_sources() -> dict
```
返回 `{(body1_name, body2_name): count}`，统计各 body 对之间的接触点数。

---

### 等式约束操作

```python
def modify_equality_objects(
    old_obj1_id: int, old_obj2_id: int,
    new_obj1_id: int, new_obj2_id: int,
)
```
查找一对 `(old_obj1_id, old_obj2_id)` 的等式约束，将其修改为新的 body 对。用于抓取/释放物体时将约束转移到目标物体。

```python
def update_equality_constraints(constraint_list: list)
```
批量更新等式约束的 `eq_data` 和 `eq_type`。传入含 `obj1_id`、`obj2_id`、`eq_data`、`eq_type` 键的字典列表。

---

### Mocap 操作

```python
async def set_mocap_pos_and_quat(
    mocap_data: dict,           # {mocap_body: {"pos": array(3,), "quat": array(4,)}}
    send_remote: bool = False,  # 是否同步到 OrcaSim 服务端（用于可视化）
)
```
设置 mocap body 的位姿。`send_remote=True` 时同时同步到服务端用于渲染。

---

### 执行器配置

```python
def set_actuator_trnid(actuator_id: int, trnid: int)
```
修改执行器的传输目标 ID（连接到的关节/肌腱/site 的 ID）。

```python
def disable_actuator(actuator_groups: list[int])
```
通过 `opt.disableactuator` 标志位禁用指定组的执行器。每组对应一个 bit，组 ID 从 0 开始。

---

### 几何体操作

```python
def set_geom_friction(geom_friction_dict: dict)
```
设置几何体的摩擦系数。传入 `{geom_name: [slide, torsional, roll]}`。

```python
def add_extra_weight(weight_load_dict: dict)
```
为 body 添加额外质量和质心偏移。传入 `{body_id: {"pos": array(3,), "weight": float}}`。常用于域随机化（domain randomization）。

```python
def get_goal_bounding_box(goal_body_name: str) -> dict
```
计算以 `goal_body_name` 为前缀的所有几何体的世界系 AABB。返回 `{"min": array(3,), "max": array(3,), "size": array(3,)}`。支持 BOX（考虑旋转）和 SPHERE 类型。

---

### 基座坐标系查询

将计算结果从世界坐标系转换到指定 body 的局部坐标系中。

```python
def query_velocity_body_B(ee_body: str, base_body: str) -> np.ndarray
```
末端执行器相对于基座的 6D 速度（基座坐标系）。返回 `[vx, vy, vz, wx, wy, wz]`，dtype `float32`。

```python
def query_position_body_B(ee_body: str, base_body: str) -> np.ndarray
```
末端执行器相对于基座的位置 `[x, y, z]`（基座坐标系）。

```python
def query_orientation_body_B(ee_body: str, base_body: str) -> np.ndarray
```
末端执行器相对于基座的姿态四元数 `[x, y, z, w]`（基座坐标系，SciPy 格式）。dtype `float32`。

```python
def query_joint_axes_B(joint_names: list[str], base_body: str) -> dict
```
关节轴在基座坐标系中的单位方向向量。返回 `{joint_name: axis_array(3,)}`，dtype `float32`。

---

### 里程计查询

以初始位置/姿态为参考的相对运动估计（常用于移动机器人导航）。

```python
def query_robot_velocity_odom(
    base_body: str,
    initial_base_pos: np.ndarray,    # [x, y, z]
    initial_base_quat: np.ndarray,   # [w, x, y, z]
) -> tuple
```
返回 `(linear_vel_odom, angular_vel_odom)`，各为 `(3,) float32` 数组（里程计坐标系）。

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
返回四元数 `[x, y, z, w]`（里程计坐标系，SciPy 格式），dtype `float32`。

---

### Opt 配置

```python
def set_opt_timestep(timestep: float)
```
设置本地 `_mjModel.opt.timestep`。仅当 `_mjModel` 不为 None 时生效。

```python
async def set_timestep_remote(timestep: float)
```
将时间步长同步到 OrcaSim 服务端。离线模式（`skip_grpc_load`）下直接调用 `set_opt_timestep`。

```python
def query_opt_config() -> dict
```
从 `_mjModel.opt` 读取全部字段，返回配置字典。包含 timestep、impratio、tolerance、solver、gravity 等。

```python
def set_opt_config()
```
将 `self.opt`（OrcaGymOptConfig）的全部字段写回 `_mjModel.opt`，确保配置一致性。

---

### 视频录制

```python
async def begin_save_video(file_path: str, capture_mode: CaptureMode = CaptureMode.ASYNC)
```
开始保存 MP4 视频。ASYNC 模式性能更优（默认），SYNC 模式保证帧对齐。

```python
async def stop_save_video()
```
停止保存视频，完成文件写入。

```python
async def get_current_frame() -> int
```
获取当前相机帧索引。

```python
async def get_camera_time_stamp(last_frame: int) -> dict
```
获取各相机的时间戳。返回 `{camera_name: [timestamp_list]}`。

```python
async def get_frame_png(image_path: str) -> dict
```
保存当前帧 PNG 并返回各相机位姿 `{camera_name: {"pos": list, "quat": list}}`。

---

### 渲染与 UI 交互

```python
async def render()
```
渲染当前状态到 OrcaSim（通过 `update_local_env`）。发送 qpos 和 time，接收并缓存控制覆盖值。

```python
async def update_local_env(qpos: np.ndarray, time: float)
```
更新本地环境状态到服务器并接收控制覆盖。在 `render()` 中自动调用。

```python
async def get_body_manipulation_anchored() -> tuple
```
返回 `(body_name, anchor_type)`。无锚定时返回 `(None, AnchorType.NONE)`。用于查询 UI 中的物体锚定状态。

```python
async def get_body_manipulation_movement() -> dict
```
返回 `{"delta_pos": array(3,), "delta_quat": array(4,)}`。用于查询 UI 中的物体拖拽增量。

---

### 性能分析

```python
def get_timer_stats() -> dict
```
返回 MuJoCo 计时器统计 `{timer_name: (duration_seconds, call_count)}`。

```python
def get_constraint_counts() -> dict
```
返回约束计数 `{"nefc": int, "ne": int, "nf": int, "ncon": int}`。

```python
def log_profile(label: str = "")
```
打印性能分析日志，包含：总耗时、瓶颈 timer、约束分解耗时、接触源统计等。输出到 `_logger.performance`。

---

## OrcaGymModel

位于 `orca_gym/core/orca_gym_model.py`。静态模型信息容器，管理名称↔ID 映射和结构查询。

### 维度属性

```python
nq: int        # qpos 长度（广义坐标数）
nv: int        # qvel/qacc 长度（自由度数）
nu: int        # 执行器数量
ngeom: int     # 几何体数量
neq: int       # 等式约束数量（init_eq_list 后可用）
nmocap: int    # mocap body 数量（init_mocap_dict 后可用）
```

### 实体类型术语

| 实体 | 说明 |
|------|------|
| **Body** | 刚体，物理仿真基本单元。有质量、惯性、位置、姿态。 |
| **Joint** | 关节，连接 body 的约束。定义相对运动（旋转/滑动/自由）。 |
| **Actuator** | 执行器，驱动机器人的元件（电机等）。对应动作空间维度。 |
| **Geom** | 几何体，用于碰撞检测的几何形状（BOX/SPHERE/CAPSULE/MESH 等）。 |
| **Site** | 标记点，不参与物理仿真。用于标记关键位置（末端执行器、目标点）。 |
| **Sensor** | 传感器，测量物理量的虚拟设备（加速度计、陀螺仪、触觉等）。 |
| **Equality Constraint** | 等式约束，强制两个 body 满足特定关系（WELD/CONNECT 等）。常用于抓取物体。 |
| **Mocap Body** | 虚拟 body，可自由移动，不受物理约束。配合等式约束实现物体操作。 |

### 初始化方法

以下方法由 Backend 在 `init_simulation()` 中调用，通常不需要用户直接调用：

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

### 名称↔ID 双向映射

| 实体 | `name2id` | `id2name` | 获取全部字典 | 按名获取 | 按ID获取 |
|------|-----------|-----------|--------------|----------|----------|
| Body | `body_name2id(n)` | `body_id2name(i)` | `get_body_dict()` | `get_body_byname(n)` | `get_body_byid(i)` |
| Joint | `joint_name2id(n)` | `joint_id2name(i)` | `get_joint_dict()` | `get_joint_byname(n)` | `get_joint_byid(i)` |
| Actuator | `actuator_name2id(n)` | `actuator_id2name(i)` | `get_actuator_dict()` | `get_actuator_byname(n)` | `get_actuator_byid(i)` |
| Geom | `geom_name2id(n)` | `geom_id2name(i)` | `get_geom_dict()` | `get_geom_byname(n)` | `get_geom_byid(i)` |
| Site | `site_name2id(n)` | `site_id2name(i)` | `get_site_dict()` | `get_site(n)` | `get_site(i)` |
| Sensor | `sensor_name2id(n)` | `sensor_id2name(i)` | `gen_sensor_dict()` | `get_sensor(n)` | `get_sensor(i)` |
| Mesh | `mesh_name2id(n)` | `mesh_id2name(i)` | `get_mesh_dict()` | `get_mesh_byname(n)` | `get_mesh_byid(i)` |

### 其他查询

```python
def get_body_names()
```
返回 body 名称的可迭代集合。

```python
def get_actuator_ctrlrange() -> np.ndarray
```
返回所有执行器控制范围 `(nu, 2)`，每行 `[min, max]`。常用于定义 Gym action_space。

```python
def get_joint_qposrange(joint_names: list[str]) -> np.ndarray
```
返回指定关节的位置范围 `(len(joint_names), 2)`。

```python
def get_eq_list() -> list
```
返回等式约束列表。

```python
def get_mocap_dict() -> dict
```
返回 mocap body 字典 `{name: mocap_id}`。

```python
def get_geom_body_name(geom_id: int) -> str
def get_geom_body_id(geom_id: int) -> int
```
几何体到所属 body 的关联查询。

### Flex Body 方法

用于处理软体（flex body）相关操作。

```python
def resolve_flex_body_name(body_name: str) -> FlexBodyInfo | None
```
统一解析 flex body 名称，支持三种类型：
- **vertex**: `{flex_name}_{index}` 格式的顶点 body
- **trilinear**: 8 个控制节点的插值 flex（如 `{flex_name}_0_0_0`）
- **quadratic**: 27 个控制节点的插值 flex（如 `{flex_name}_1_1_1`）

返回 `FlexBodyInfo` 包含 `original_name`、`actual_body_name`、`flex_type`、`flex_name`、`vertex_index`。

```python
def is_flex_body(body_name: str) -> bool
```
判断给定名称是否为 flex 相关 body。

```python
def parse_flex_vertex_name(body_name: str) -> tuple[str, int] | None
```
解析 flex vertex 名称，返回 `(flex_name, vertex_index)`。

```python
def get_flex_info_by_body_id(body_id: int) -> tuple[int, int] | None
```
根据 body_id 返回 `(flex_id, local_vertex_index)`。

### FlexBodyInfo 数据类

```python
@dataclass
class FlexBodyInfo:
    original_name: str        # 原始传入的 body 名称
    actual_body_name: str     # 实际用于约束的 body 名称
    flex_type: Literal["normal", "vertex", "trilinear", "quadratic"]
    flex_name: str | None
    vertex_index: int | None
```

---

## OrcaGymData

位于 `orca_gym/core/orca_gym_data.py`。动态仿真状态容器。

### 属性

```python
qpos: np.ndarray       # (nq,)  广义坐标（关节位置）
qvel: np.ndarray       # (nv,)  广义速度（关节速度）
qacc: np.ndarray       # (nv,)  广义加速度
qfrc_bias: np.ndarray  # (nv,)  偏置力（重力 + 科里奥利力 + 离心力）
time: float            # 仿真时间（秒）
```

### 更新方法

```python
def update_qpos_qvel_qacc(qpos, qvel, qacc)
```
一次性更新 qpos、qvel、qacc。

```python
def update_qfrc_bias(qfrc_bias)
```
更新偏置力。

---

## OrcaGymOptConfig

位于 `orca_gym/core/orca_gym_opt_config.py`。MuJoCo 物理引擎优化器配置。

### 全部字段

```python
class OrcaGymOptConfig:
    # ---------- 时间 ----------
    timestep: float              # 物理时间步长（默认 0.001s）

    # ---------- 求解器 ----------
    integrator: int              # 积分器类型（0=Euler, 1=RK4）
    cone: int                    # 摩擦锥类型
    jacobian: int                # 雅可比类型
    solver: int                  # 求解器（0=PGS, 1=CG, 2=Newton）
    iterations: int              # 主迭代次数
    ls_iterations: int           # 线搜索迭代次数
    noslip_iterations: int       # 无滑动约束迭代次数
    ccd_iterations: int          # CCD 迭代次数
    sdf_iterations: int          # SDF 迭代次数

    # ---------- 容差 ----------
    tolerance: float             # 主求解器容差
    ls_tolerance: float          # 线搜索容差
    noslip_tolerance: float      # 无滑动约束容差
    ccd_tolerance: float         # CCD 容差
    impratio: float              # 阻抗比

    # ---------- 物理环境 ----------
    gravity: list[float]         # 重力 [gx, gy, gz]
    wind: list[float]            # 风力 [wx, wy, wz]
    magnetic: list[float]        # 磁场 [mx, my, mz]
    density: float               # 空气密度
    viscosity: float             # 空气粘度

    # ---------- 接触 ----------
    o_margin: float              # 接触边距
    o_solref: list[float]        # 接触求解器参考 [timeconst, dampratio]
    o_solimp: list[float]        # 接触求解器阻抗 [dmin, dmax, width, mid, power]
    o_friction: list[float]      # 摩擦参数 [slide, torsional, roll]

    # ---------- 标志位 ----------
    disableflags: int            # 禁用标志位掩码
    enableflags: int             # 启用标志位掩码
    disableactuator: int         # 禁用执行器组位掩码
    filterparent: bool           # 是否过滤父子碰撞

    # ---------- SDF ----------
    sdf_initpoints: int          # SDF 初始采样点数
```

### 常用使用示例

```python
# 调整重力（零重力环境）
gym.opt.gravity = [0.0, 0.0, 0.0]
gym.set_opt_config()

# 调整求解器精度
gym.opt.timestep = 0.002        # 增大步长（加速仿真）
gym.opt.iterations = 100        # 增加迭代次数（提高精度）
gym.set_opt_config()
```

---

## 辅助枚举与函数

位于 `orca_gym/core/orca_gym_local.py`。

### AnchorType

```python
class AnchorType:
    NONE = 0   # 无锚定（释放物体）
    WELD = 1   # 焊接锚定（完全固定位置和姿态）
    BALL = 2   # 球关节锚定（固定位置，允许旋转）
```

### CaptureMode

```python
class CaptureMode:
    ASYNC = 0  # 异步视频捕获（性能更优，帧可能不完全对齐）
    SYNC = 1   # 同步视频捕获（帧精确对齐，性能较低）
```

### 工具函数

```python
def get_qpos_size(joint_type: int) -> int
```
返回关节在 `qpos` 数组中占用的元素数：FREE=7, BALL=4, HINGE/SLIDE=1, 其他=0。

```python
def get_dof_size(joint_type: int) -> int
```
返回关节的自由度数（对应 `qvel/qacc` 中的元素数）：FREE=6, BALL=3, HINGE/SLIDE=1, 其他=0。

```python
def get_eq_type(anchor_type: AnchorType) -> int
```
将 AnchorType 映射为 MuJoCo 等式约束类型。WELD → `mjEQ_WELD`，BALL → `mjEQ_CONNECT`。

### 使用示例

```python
# 获取关节的 qpos 和 dof 大小
joint_type = gym._mjModel.jnt_type[joint_id]
qpos_len = get_qpos_size(joint_type)    # 1, 4, 或 7
dof_len = get_dof_size(joint_type)      # 1, 3, 或 6

# 焊接锚定一个物体
gym.anchor_actor("box_object", AnchorType.WELD)

# 开始异步视频录制
await gym.begin_save_video("/tmp/output.mp4", CaptureMode.ASYNC)
```
