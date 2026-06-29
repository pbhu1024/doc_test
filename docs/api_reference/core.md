# 🧬 Core API

核心仿真接口，位于 `orca_gym/core/`。

## OrcaGymBase

基类，封装 gRPC 通信。

```python
class OrcaGymBase:
    stub: GrpcServiceStub       # gRPC 存根
    model: OrcaGymModel         # 模型信息
    data: OrcaGymData           # 动态状态
    opt: OrcaGymOptConfig       # 优化配置
    
    async def pause_simulation()                   # 暂停服务端仿真
    async def set_qpos(qpos)                       # 设置 qpos
    async def set_qvel(qvel)                       # 设置 qvel
    async def mj_forward()                         # 前向计算 (远端)
    async def mj_step(nstep)                       # 物理步进 (远端)
```

## OrcaGymLocal

本地 MuJoCo backend，继承自 `OrcaGymBase`。

```python
class OrcaGymLocal(OrcaGymBase):
    # === 初始化 ===
    def __init__(self, stub)
    
    # === 模型加载 ===
    async def load_model_xml() -> str          # 获取 XML 并下载依赖
    async def init_simulation(xml_path)        # 创建 MjModel/MjData
    
    # === 仿真控制 ===
    def set_ctrl(ctrl: np.ndarray)             # 设置控制输入 (nu,)
    def mj_step(nstep: int)                    # 推进 nstep 物理步
    def mj_forward()                           # 前向更新
    def mj_inverse()                           # 逆动力学
    def update_data()                          # 同步到 self.data
    def load_initial_frame()                   # 重置到初始状态
    def set_time_step(time_step: float)        # 设置时间步长
    
    # === 状态查询 ===
    def query_joint_qpos(names) -> dict        # 关节位置
    def query_joint_qvel(names) -> dict        # 关节速度
    def query_joint_qacc(names) -> dict        # 关节加速度
    def query_joint_offsets(names) -> tuple    # qpos/qvel/qacc 偏移
    def query_joint_lengths(names) -> tuple    # qpos/qvel/qacc 长度
    def jnt_qposadr(name) -> int               # 单关节 qpos 地址
    def jnt_dofadr(name) -> int                # 单关节 dof 地址
    def query_body_xpos_xmat_xquat(names) -> dict  # Body 位姿
    def query_sensor_data(names) -> dict       # 传感器数据
    
    # === 模型查询 ===
    def query_model_info() -> dict             # 模型维度
    def query_opt_config() -> dict             # opt 参数
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
    def mj_fullM() -> np.ndarray               # 质量矩阵 (nv, nv)
    def mj_jacBody(jacp, jacr, body_id)        # Body 雅可比
    def mj_jacSite(jacp, jacr, site_id)        # Site 雅可比
    def mj_apply_force_at_site(site, force, torque)  # 施力
    def mj_clear_xfrc_applied_for_site(site)   # 清零外力
    
    # === 接触 ===
    def query_contact_simple() -> list         # 接触对
    def query_contact_force(ids) -> dict       # 6D 接触力
    def get_cfrc_ext() -> np.ndarray           # Body 外部约束力 (nbody, 6)
    def get_contact_sources() -> dict          # 接触来源统计
    
    # === 等式约束 ===
    def modify_equality_objects(o1, o2, n1, n2)
    def update_equality_constraints(eq_list)
    
    # === Mocap ===
    def set_mocap_pos_and_quat(data, send_remote=False)
    
    # === 执行器 ===
    def set_actuator_trnid(actuator_id, trnid)
    def disable_actuator(actuator_groups: list[int])
    
    # === 视频 ===
    async def begin_save_video(path, mode=ASYNC)
    async def stop_save_video()
    async def get_current_frame() -> int
    async def get_camera_time_stamp(last_frame) -> dict
    async def get_frame_png(path) -> dict
    
    # === 渲染 ===
    async def render()
    async def update_local_env(qpos, time)
    
    # === UI 交互 ===
    async def get_body_manipulation_anchored() -> tuple
    async def get_body_manipulation_movement() -> dict
    
    # === 性能分析 ===
    def get_timer_stats() -> dict
    def get_constraint_counts() -> dict
    def log_profile(label="")
    
    # === 属性 ===
    @property xml_file_dir -> str              # ~/.orcagym/tmp/
    
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
    body_name2id(name) -> int / body_id2name(i) -> str
    joint_name2id(name) -> int
    actuator_name2id(name) -> int
    site_name2id(name) -> int
    sensor_name2id(name) -> int
    
    # 查询
    get_body_names() -> set[str]
    get_actuator_ctrlrange() -> np.ndarray  # (nu, 2)
    get_body(name) -> dict
    get_joint(name) -> dict
    get_actuator(name) -> dict
    get_site(name) -> dict
    get_sensor(name) -> dict
    get_eq_list() -> list
    get_mocap_dict() -> dict
    gen_sensor_dict() -> dict
```

## OrcaGymData

动态仿真状态。

```python
class OrcaGymData:
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
    timestep: float          # 时间步长
    solver: int              # 求解器类型
    iterations: int          # 迭代次数
    gravity: list[float]     # 重力向量 (3,)
    density: float           # 密度
    viscosity: float         # 粘度
    o_margin: float          # 接触边距
    o_solref: list[float]    # 接触求解器参数 (2,)
    o_solimp: list[float]    # 接触求解器参数 (5,)
    o_friction: list[float]  # 摩擦参数 (3,)
    integrator: int          # 积分器类型
    cone: int                # 摩擦锥类型
    jacobian: int            # 雅可比类型
    # ... 其他 20+ 字段
```

## 辅助类型

```python
AnchorType.NONE  = 0   # 无锚定
AnchorType.WELD  = 1   # 焊接
AnchorType.BALL  = 2   # 球关节

CaptureMode.ASYNC = 0  # 异步视频捕获
CaptureMode.SYNC  = 1  # 同步视频捕获

def get_qpos_size(joint_type) -> int    # 关节 qpos 元素数
def get_dof_size(joint_type) -> int     # 关节自由度
def get_eq_type(anchor_type) -> int     # 锚点到等式约束类型
```
