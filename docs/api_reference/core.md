# 🧬 Core API

核心仿真接口，位于 `orca_gym/core/`。

## OrcaGymBase

基类，封装 gRPC 通信。

```python
class OrcaGymBase:
    def __init__(self, stub)

    stub: GrpcServiceStub       # gRPC 存根（可为 None）
    model: OrcaGymModel | None  # 模型信息（初始化后填充）
    data: OrcaGymData | None    # 动态状态（初始化后填充）
    opt: OrcaGymOptConfig | None  # 优化配置（初始化后填充）

    # 异步方法（需要 await）
    async def pause_simulation()                   # 暂停服务端仿真
    async def set_qpos(qpos: np.ndarray)           # 设置 qpos (nq,)
    async def set_qvel(qvel: np.ndarray)           # 设置 qvel (nv,)
    async def mj_forward()                         # 前向计算 (远端)
    async def mj_inverse()                         # 逆动力学 (远端)
    async def mj_step(nstep: int)                  # 物理步进 (远端)

    # 调试方法
    def print_opt_config()                         # 打印 opt 配置
    def print_model_info(model_info: dict)         # 打印模型维度信息
```

## OrcaGymLocal

本地 MuJoCo backend，继承自 `OrcaGymBase`。

```python
class OrcaGymLocal(OrcaGymBase):
    # === 初始化 ===
    def __init__(
        self,
        stub,
        *,
        skip_grpc_load: bool = False,
        local_xml_path: str | None = None,
        xml_assets_dir: str | None = None,
    )

    # === 模型加载 (异步) ===
    async def load_model_xml() -> str              # 获取 XML 并下载依赖，返回本地路径
    async def init_simulation(xml_path: str)       # 创建 MjModel/MjData 并初始化 model/data/opt

    # === 仿真控制 (本地，非异步) ===
    def set_ctrl(ctrl: np.ndarray)                 # 设置控制输入 (nu,)
    def mj_step(nstep: int)                        # 推进 nstep 物理步
    def mj_forward()                               # 前向更新
    def mj_inverse()                               # 逆动力学
    def update_data()                              # 同步 _mjData → self.data
    def update_data_external(qpos, qvel, qacc, qfrc_bias, time)  # 从外部数据更新
    def load_initial_frame()                       # 重置到初始状态
    def set_time_step(time_step: float)            # 设置本地及远端时间步长

    # === opt 配置 ===
    def set_opt_timestep(timestep: float)          # 设置本地 opt.timestep
    async def set_timestep_remote(timestep: float) # 同步时间步长到远端
    def query_opt_config() -> dict                 # 查询本地 opt 配置
    def set_opt_config()                           # 将 self.opt 同步到 _mjModel.opt

    # === 状态查询 ===
    def query_joint_qpos(names: list[str]) -> dict     # 关节位置
    def query_joint_qvel(names: list[str]) -> dict     # 关节速度
    def query_joint_qacc(names: list[str]) -> dict     # 关节加速度
    def query_joint_offsets(names: list[str]) -> tuple  # 返回 (qpos_offsets, qvel_offsets, qacc_offsets)
    def query_joint_lengths(names: list[str]) -> tuple  # 返回 (qpos_lengths, qvel_lengths, qacc_lengths)
    def jnt_qposadr(name: str) -> int                   # 单关节 qpos 地址
    def jnt_dofadr(name: str) -> int                    # 单关节 dof 地址
    def query_body_xpos_xmat_xquat(names: list[str]) -> dict  # Body 位姿 {name: {Pos, Mat, Quat}}
    def query_body_xpos_xmat_xquat_xvel(names: list[str]) -> dict  # Body 位姿 + 世界系线速度
    def query_sensor_data(names: list[str]) -> dict     # 传感器数据
    def query_site_pos_and_mat(names: list[str]) -> dict  # Site 位姿 (返回 xmat 而非 xquat)
    def query_site_size(names: list[str]) -> dict       # Site 尺寸

    # === 状态设置 ===
    def set_joint_qpos(joint_qpos: dict)            # 按关节名设置 qpos
    def set_joint_qvel(joint_qvel: dict)            # 按关节名设置 qvel

    # === 模型查询 ===
    def query_model_info() -> dict                 # 模型维度 (含 nq/nv/nu/nbody/njnt/ngeom/nsite/ncam/nflex 等)
    def query_all_bodies() -> dict
    def query_all_joints() -> dict
    def query_all_actuators() -> dict
    def query_all_geoms() -> dict
    def query_all_sites() -> dict
    def query_all_sensors() -> dict
    def query_all_meshes() -> dict
    def query_all_equality_constraints() -> list
    def query_all_mocap_bodies() -> dict

    # === 动力学 ===
    def mj_fullM() -> np.ndarray                   # 质量矩阵 (nv, nv)
    def mj_jacBody(jacp, jacr, body_id)            # Body 雅可比
    def mj_jacSite(jacp, jacr, site_id)            # Site 雅可比
    def mj_jac_site(site_names: list[str]) -> dict # 批量 Site 雅可比 {name: {jacp, jacr}}
    def mj_apply_force_at_site(site_name: str, force: np.ndarray, torque: np.ndarray)
    def mj_clear_xfrc_applied_for_site(site_name: str)

    # === 接触 ===
    def query_contact_simple() -> list             # 接触对 [{ID, Dim, Geom1, Geom2}]
    def query_contact_force(ids: list[int]) -> dict  # 6D 接触力 {id: array(6,)}
    def get_cfrc_ext() -> np.ndarray               # Body 外部约束力 (nbody, 6)
    def get_contact_sources() -> dict              # 接触来源统计 {(body1, body2): count}

    # === 等式约束 ===
    def modify_equality_objects(old_obj1_id, old_obj2_id, new_obj1_id, new_obj2_id)
    def update_equality_constraints(constraint_list: list)

    # === Mocap ===
    async def set_mocap_pos_and_quat(data: dict, send_remote: bool = False)

    # === 执行器 ===
    def set_actuator_trnid(actuator_id: int, trnid: int)
    def disable_actuator(actuator_groups: list[int])
    def query_actuator_torques(names: list[str]) -> dict  # 执行器扭矩 {name: array(6,)}

    # === 几何体 ===
    def set_geom_friction(geom_friction_dict: dict)  # {geom_name: [slide, torsional, roll]}
    def add_extra_weight(weight_load_dict: dict)     # {body_id: {pos, weight}}
    def get_goal_bounding_box(goal_body_name: str) -> dict  # {min, max, size}

    # === 视频 (异步) ===
    async def begin_save_video(path: str, mode=CaptureMode.ASYNC)
    async def stop_save_video()
    async def get_current_frame() -> int
    async def get_camera_time_stamp(last_frame: int) -> dict
    async def get_frame_png(path: str) -> dict

    # === 渲染 (异步) ===
    async def render()
    async def update_local_env(qpos, time)

    # === UI 交互 (异步) ===
    async def get_body_manipulation_anchored() -> tuple  # (body_name, anchor_type) | (None, NONE)
    async def get_body_manipulation_movement() -> dict   # {delta_pos, delta_quat}

    # === 里程计 / 基座相对查询 ===
    def query_velocity_body_B(ee_body: str, base_body: str) -> np.ndarray    # 6D 速度 (基座坐标系)
    def query_position_body_B(ee_body: str, base_body: str) -> np.ndarray    # 3D 位置 (基座坐标系)
    def query_orientation_body_B(ee_body: str, base_body: str) -> np.ndarray # 四元数 (基座坐标系, SciPy 格式)
    def query_joint_axes_B(joint_names: list[str], base_body: str) -> dict   # 关节轴方向 (基座坐标系)
    def query_robot_velocity_odom(base_body, initial_base_pos, initial_base_quat) -> tuple  # (linear, angular)
    def query_robot_position_odom(base_body, initial_base_pos, initial_base_quat) -> np.ndarray
    def query_robot_orientation_odom(base_body, initial_base_pos, initial_base_quat) -> np.ndarray

    # === 关节地址 ===
    def query_joint_dofadrs(names: list[str]) -> dict  # {joint_name: dof_adr}

    # === 资源加载 ===
    async def load_content_file(content_file_name, remote_file_dir="", local_file_dir="", temp_file_path=None) -> str

    # === 性能分析 ===
    def get_timer_stats() -> dict
    def get_constraint_counts() -> dict
    def log_profile(label: str = "")

    # === 属性 ===
    @property xml_file_dir -> str                  # ~/.orcagym/tmp/ (或 xml_assets_dir)

    # === 内部属性 ===
    _mjModel: mujoco.MjModel
    _mjData: mujoco.MjData
    _override_ctrls: dict[int, float]
```

## OrcaGymModel

静态模型信息。

```python
class OrcaGymModel:
    # 维度
    nq, nv, nu, nbody, njnt, ngeom, nsite, nconmax

    # 字典初始化
    init_body_dict(d) / init_joint_dict(d) / init_actuator_dict(d)
    init_geom_dict(d) / init_site_dict(d) / init_sensor_dict(d)
    init_eq_list(l) / init_mocap_dict(d) / init_mesh_dict(d)

    # 名称↔ID 映射
    body_name2id(name: str) -> int / body_id2name(i: int) -> str
    joint_name2id(name: str) -> int / joint_id2name(i: int) -> str
    actuator_name2id(name: str) -> int / actuator_id2name(i: int) -> str
    geom_name2id(name: str) -> int / geom_id2name(i: int) -> str
    site_name2id(name: str) -> int / site_id2name(i: int) -> str
    sensor_name2id(name: str) -> int / sensor_id2name(i: int) -> str
    mesh_name2id(name: str) -> int / mesh_id2name(i: int) -> str

    # 字典获取
    get_body_dict() -> dict / get_body_byname(name: str) -> dict / get_body_byid(id: int) -> dict
    get_joint_dict() -> dict / get_joint_byname(name: str) -> dict / get_joint_byid(id: int) -> dict
    get_actuator_dict() -> dict / get_actuator_byname(name: str) -> dict / get_actuator_byid(id: int) -> dict
    get_geom_dict() -> dict / get_geom_byname(name: str) -> dict / get_geom_byid(id: int) -> dict
    get_site_dict() -> dict / get_site(name_or_id: str | int) -> dict | None
    gen_sensor_dict() -> dict / get_sensor(name_or_id: str | int) -> dict | None
    get_mesh_dict() -> dict / get_mesh_byname(name: str) -> dict | None / get_mesh_byid(id: int) -> dict

    # 查询
    get_body_names()                            # body 名称可迭代集合
    get_actuator_ctrlrange() -> np.ndarray      # (nu, 2)
    get_joint_qposrange(joint_names: list[str]) -> np.ndarray
    get_eq_list() -> list
    get_mocap_dict() -> dict

    # Flex body 相关
    resolve_flex_body_name(body_name: str) -> FlexBodyInfo | None
    is_flex_body(body_name: str) -> bool
    parse_flex_vertex_name(body_name: str) -> tuple[str, int] | None
    get_flex_info_by_body_id(body_id: int) -> tuple[int, int] | None

    # Geom 关联
    get_geom_body_name(geom_id: int) -> str
    get_geom_body_id(geom_id: int) -> int
```

## OrcaGymData

动态仿真状态。

```python
class OrcaGymData:
    def __init__(self, model: OrcaGymModel)

    qpos: np.ndarray       # (nq,) 广义坐标
    qvel: np.ndarray       # (nv,) 广义速度
    qacc: np.ndarray       # (nv,) 广义加速度
    qfrc_bias: np.ndarray  # (nv,) 偏置力
    time: float            # 仿真时间

    def update_qpos_qvel_qacc(qpos, qvel, qacc)
    def update_qfrc_bias(qfrc_bias)
```

## OrcaGymOptConfig

MuJoCo 优化配置。

```python
class OrcaGymOptConfig:
    def __init__(self, opt_config: dict)

    timestep: float          # 时间步长
    impratio: float          # 阻抗比例
    tolerance: float         # 主求解器容差
    ls_tolerance: float      # 线搜索容差
    noslip_tolerance: float  # 无滑动约束容差
    ccd_tolerance: float     # CCD 容差
    gravity: list[float]     # 重力向量 (3,)
    wind: list[float]        # 风力 (3,)
    magnetic: list[float]    # 磁场 (3,)
    density: float           # 空气密度
    viscosity: float         # 空气粘度
    o_margin: float          # 接触边距
    o_solref: list[float]    # 接触求解器参考 (2,)
    o_solimp: list[float]    # 接触求解器阻抗 (5,)
    o_friction: list[float]  # 摩擦参数 (3,)
    integrator: int          # 积分器类型
    cone: int                # 摩擦锥类型
    jacobian: int            # 雅可比类型
    solver: int              # 求解器类型
    iterations: int          # 主迭代次数
    ls_iterations: int       # 线搜索迭代次数
    noslip_iterations: int   # 无滑动迭代次数
    ccd_iterations: int      # CCD 迭代次数
    disableflags: int        # 禁用标志位
    enableflags: int         # 启用标志位
    disableactuator: int     # 禁用执行器组
    sdf_initpoints: int      # SDF 初始化点数
    sdf_iterations: int      # SDF 迭代次数
    filterparent: bool       # 是否过滤父级碰撞
```

## 辅助类型

```python
class AnchorType:
    NONE = 0   # 无锚定
    WELD = 1   # 焊接
    BALL = 2   # 球关节

class CaptureMode:
    ASYNC = 0  # 异步视频捕获
    SYNC = 1   # 同步视频捕获

def get_qpos_size(joint_type: int) -> int    # 关节 qpos 元素数
def get_dof_size(joint_type: int) -> int     # 关节自由度
def get_eq_type(anchor_type: AnchorType) -> int  # 锚点到等式约束类型
```
