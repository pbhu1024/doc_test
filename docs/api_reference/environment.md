# 🌍 Environment API

Gymnasium 环境接口，位于 `orca_gym/environment/`。

## OrcaGymBaseEnv

所有环境的抽象基类。

```python
class OrcaGymBaseEnv(gym.Env):
    # === 构造参数 ===
    def __init__(
        self,
        frame_skip: int,           # step() 对应的物理步数
        orcagym_addr: str,         # gRPC 地址
        agent_names: list[str],    # 智能体名称
        time_step: float,          # 物理时间步长
        **kwargs
    )

    # === 属性 ===
    gym: OrcaGymLocal             # backend
    model: OrcaGymModel           # 模型信息
    data: OrcaGymData             # 动态状态
    frame_skip: int
    orcagym_addr: str
    seed: int
    loop: asyncio.AbstractEventLoop

    @property dt: float           # timestep × frame_skip
    @property agent_num: int      # 智能体数量

    # === 抽象方法（子类必须实现）===
    def step(action) -> tuple[ObsType, float, bool, bool, dict]
    def reset_model() -> tuple[dict, dict]
    def initialize_simulation() -> tuple[OrcaGymModel, OrcaGymData]
    def _step_orca_sim_simulation(ctrl, n_frames) -> None
    def render()

    # === 工具方法 ===
    def generate_action_space(bounds: np.ndarray) -> Space      # spaces.Box
    def generate_observation_space(obs: dict | np.ndarray) -> Space  # spaces.Box 或 Dict
    def reset(*, seed=None, options=None) -> tuple[dict, dict]

    # === 多智能体命名 ===
    def body(name: str, agent_id: int = None) -> str
    def joint(name: str, agent_id: int = None) -> str
    def actuator(name: str, agent_id: int = None) -> str
    def site(name: str, agent_id: int = None) -> str
    def mocap(name: str, agent_id: int = None) -> str
    def sensor(name: str, agent_id: int = None) -> str

    # === 初始化 (抽象) ===
    def initialize_grpc()                            # 创建 gRPC 通道
    def pause_simulation()                           # 暂停服务端
    def set_time_step(ts: float)                     # 设置 timestep
    def init_qpos_qvel()                             # 缓存初始状态
    def reset_simulation()                           # 重置仿真

    # === 仿真步进 (抽象) ===
    def do_simulation(ctrl, n_frames) -> None
    def close()
```

## OrcaGymLocalEnv

本地环境实现。

```python
class OrcaGymLocalEnv(OrcaGymBaseEnv):
    metadata = {'render_modes': ['human', 'none'], 'version': '0.0.1', 'render_fps': 30}

    def __init__(
        self,
        frame_skip: int,
        orcagym_addr: str,
        agent_names: list[str],
        time_step: float,
        **kwargs  # 支持 skip_grpc_load, local_xml_path, xml_assets_dir
    )

    # === 核心方法 ===
    def initialize_simulation() -> tuple[OrcaGymModel, OrcaGymData]
    def do_simulation(ctrl, n_frames) -> None        # set_ctrl + mj_step + update_data
    def render()                                     # 渲染当前帧
    def close()                                      # 关闭 gRPC 通道
    def reset_simulation()                           # load_initial_frame + update_data + set_time_step
    def init_qpos_qvel()                             # 缓存初始 qpos/qvel
    def set_time_step(time_step: float)              # 设置本地及远端 timestep

    # === 仿真控制（透传至 gym） ===
    def set_ctrl(ctrl: np.ndarray)                   # 设置控制输入 (nu,)
    def mj_step(nstep: int)                          # 推进 nstep 物理步
    def mj_forward()                                 # 前向更新
    def update_data()                                # 同步最新数据

    # === 位姿查询 ===
    def get_body_xpos_xmat_xquat(names: list[str]) -> tuple[np.ndarray, np.ndarray, np.ndarray]
        # 返回三个 flat 数组: (xpos_flat, xmat_flat, xquat_flat)
    def get_body_xpos_xmat_xquat_xvel(names: list[str]) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]
    def query_site_pos_and_mat(names: list[str]) -> dict  # {name: {xpos, xmat}}
    def query_site_pos_and_quat(names: list[str]) -> dict # {name: {xpos, xquat}}
    def query_site_pos_and_quat_B(site_names, base_body_list) -> dict  # 基座坐标系
    def query_site_size(names: list[str]) -> dict

    # === 速度查询 ===
    def query_site_xvalp_xvalr(site_names) -> tuple[dict, dict]  # 世界系线速度/角速度
    def query_site_xvalp_xvalr_B(site_names, base_body_list) -> tuple[dict, dict]  # 基座坐标系

    # === 关节状态查询 ===
    def query_joint_qpos(names: list[str]) -> dict
    def query_joint_qvel(names: list[str]) -> dict
    def query_joint_qacc(names: list[str]) -> dict
    def query_joint_offsets(names: list[str]) -> tuple  # (qpos_offsets, qvel_offsets, qacc_offsets)
    def query_joint_lengths(names: list[str]) -> tuple  # (qpos_lengths, qvel_lengths, qacc_lengths)
    def jnt_qposadr(name: str) -> int
    def jnt_dofadr(name: str) -> int
    def query_joint_dofadrs(names: list[str]) -> dict

    # === 关节状态设置 ===
    def set_joint_qpos(joint_qpos: dict)            # {joint_name: qpos_array}
    def set_joint_qvel(joint_qvel: dict)            # {joint_name: qvel_array}

    # === 传感器 ===
    def query_sensor_data(names: list[str]) -> dict

    # === 接触 ===
    def query_contact_simple() -> list
    def query_contact_force(contact_ids: list[int]) -> dict
    def get_cfrc_ext() -> np.ndarray

    # === 物体操作 ===
    def anchor_actor(name: str, anchor_type: AnchorType)   # 锚定物体 (支持 body / flex vertex / interpolated flex)
    def release_body_anchored()                            # 释放
    def update_anchor_equality_constraints(actor_name: str, anchor_type: AnchorType)

    # === Mocap ===
    def set_mocap_pos_and_quat(data: dict)

    # === 等式约束 ===
    def update_equality_constraints(eq_list: list)

    # === UI 操作 ===
    def get_body_manipulation_anchored() -> tuple   # (body_name, anchor_type) | (None, NONE)
    def get_body_manipulation_movement() -> tuple   # (delta_pos, delta_quat)

    # === 视频 ===
    def begin_save_video(path: str, mode=CaptureMode.ASYNC)
    def stop_save_video()
    def get_current_frame() -> int
    def get_next_frame() -> int
    def get_camera_time_stamp(last_frame: int) -> dict
    def get_frame_png(path: str) -> dict

    # === 雅可比 ===
    def mj_jacBody(jacp, jacr, body_id)
    def mj_jacSite(jacp, jacr, site_name)

    # === 力控制 ===
    def mj_apply_force_at_site(site_name: str, force: np.ndarray, torque: np.ndarray)
    def mj_clear_xfrc_applied_for_site(site_name: str)
    def apply_force_to_body(body_name: str, force: np.ndarray, torque: np.ndarray)

    # === 机器人学常用 ===
    def query_velocity_body_B(ee_body, base_body) -> np.ndarray        # 6D 速度 (基座坐标系)
    def query_position_body_B(ee_body, base_body) -> np.ndarray        # 3D 位置 (基座坐标系)
    def query_orientation_body_B(ee_body, base_body) -> np.ndarray     # 四元数 (基座坐标系)
    def query_joint_axes_B(joint_names, base_body) -> dict             # 关节轴方向
    def query_robot_velocity_odom(base_body, initial_base_pos, initial_base_quat) -> tuple
    def query_robot_position_odom(base_body, initial_base_pos, initial_base_quat) -> np.ndarray
    def query_robot_orientation_odom(base_body, initial_base_pos, initial_base_quat) -> np.ndarray

    # === 执行器 ===
    def query_actuator_torques(names: list[str]) -> dict
    def set_actuator_trnid(actuator_id: int, trnid: int)
    def disable_actuator(actuator_groups: list[int])

    # === 几何体 ===
    def set_geom_friction(geom_friction_dict: dict)
    def add_extra_weight(weight_load_dict: dict)
    def get_goal_bounding_box(geom_name: str) -> dict

    # === 资源加载 ===
    def load_content_file(content_file_name, remote_file_dir="", local_file_dir="", temp_file_path=None) -> str
```

## OrcaGymRemoteEnv

远程环境（gRPC 驱动）。

```python
class OrcaGymRemoteEnv(OrcaGymBaseEnv):
    metadata = {'render_modes': ['human', 'none'], 'version': '0.0.1', 'render_fps': 30}

    def initialize_simulation() -> tuple[OrcaGymModel, OrcaGymData]
    def do_simulation(ctrl, n_frames) -> None
    def render()  # no-op

    # 远程状态查询
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
    def query_contact() -> list
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

    # 远程状态设置
    def set_qpos_qvel(qpos, qvel)
    def set_joint_qpos(joint_qpos: dict)
    def set_mocap_pos_and_quat(mocap_pos_and_quat_dict: dict)
    def set_opt_config()
    def set_ctrl(ctrl: np.ndarray)
    def set_actuator_gain_prm(gain_prm_set_list)
    def set_actuator_bias_prm(bias_prm_set_list)
    def set_geom_friction(geom_name_list, friction_list)

    # 约束 & 动力学
    def update_equality_constraints(eq_list: list)
    def mj_jac(body_point_list, compute_jacp=True, compute_jacr=True) -> tuple
    def calc_full_mass_matrix() -> np.ndarray

    # 关键帧
    def load_keyframe(keyframe_name: str)
    def close()
```

## 异步环境

```python
# 异步环境
class OrcaGymAsyncEnv:
    def __init__(env_fn, num_envs)
    ...

# 向量化环境
class OrcaGymVectorEnv:
    def __init__(env_fns: list)
    def step(actions) -> (obs, rewards, terminated, truncated, infos)
    def reset() -> obs
    ...

# 环境运行器
class SingleAgentEnvRunner:
    def __init__(env_fn, policy, num_episodes)
    def run() -> results
```
