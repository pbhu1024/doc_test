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
    
    @property dt: float           # timestep × frame_skip
    
    # === 抽象方法（子类必须实现）===
    def step(action) -> (obs, reward, terminated, truncated, info)
    def reset_model() -> tuple[dict, dict]
    def initialize_simulation() -> (OrcaGymModel, OrcaGymData)
    def _step_orca_sim_simulation(ctrl, n_frames)
    def render()
    
    # === 工具方法 ===
    def generate_action_space(bounds) -> Space      # spaces.Box
    def generate_observation_space(obs) -> Space     # spaces.Box 或 Dict
    
    # === 多智能体命名 ===
    def body(name, agent_id=None) -> str
    def joint(name, agent_id=None) -> str
    def actuator(name, agent_id=None) -> str
    def site(name, agent_id=None) -> str
    def mocap(name, agent_id=None) -> str
    def sensor(name, agent_id=None) -> str
    
    # === 初始化 ===
    def initialize_grpc()                            # 创建 gRPC 通道
    def pause_simulation()                           # 暂停服务端
    def set_time_step(ts)                            # 设置 timestep
    def init_qpos_qvel()                             # 缓存初始状态
    def reset_simulation()                           # 重置仿真
```

## OrcaGymLocalEnv

本地环境实现。

```python
class OrcaGymLocalEnv(OrcaGymBaseEnv):
    metadata = {'render_modes': ['human', 'none'], 'render_fps': 30}
    
    def __init__(frame_skip, orcagym_addr, agent_names, time_step, **kwargs)
    
    # === 核心方法 ===
    def do_simulation(ctrl, n_frames)                # set_ctrl + mj_step + update_data
    def render()                                     # 渲染当前帧
    def close()                                      # 关闭 gRPC 通道
    
    # === 位姿查询 ===
    def get_body_xpos_xmat_xquat(names) -> dict      # Body 位姿
    def query_site_pos_and_quat(names) -> dict        # Site 位姿
    def query_site_size(names) -> dict                # Site 大小
    
    # === 传感器 ===
    def query_sensor_data(names) -> dict
    
    # === 接触 ===
    def query_contact_simple() -> list
    def query_contact_force(ids) -> dict
    def get_cfrc_ext() -> np.ndarray
    
    # === 物体操作 ===
    def anchor_actor(name, anchor_type)              # 锚定物体
    def release_body_anchored()                      # 释放
    def update_anchor_equality_constraints(eq_list)
    
    # === Mocap ===
    def set_mocap_pos_and_quat(data)
    
    # === UI 操作 ===
    def get_body_manipulation_anchored() -> tuple
    def get_body_manipulation_movement() -> tuple
    
    # === 视频 ===
    def begin_save_video(path, mode=ASYNC)
    def stop_save_video()
    def get_current_frame() -> int
    def get_next_frame() -> int
    def get_camera_time_stamp(last_frame) -> dict
    def get_frame_png(path) -> dict
    
    # === 机器人学常用 ===
    def query_velocity_body_B(body_names)            # Body 速度 (body frame)
    def query_robot_*_odom(...)                      # 里程计相关
```

## OrcaGymRemoteEnv

远程环境（gRPC 驱动）。

```python
class OrcaGymRemoteEnv(OrcaGymBaseEnv):
    # 与 LocalEnv 相同接口
    # 但通过 gRPC 远程执行所有 MuJoCo 操作
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
