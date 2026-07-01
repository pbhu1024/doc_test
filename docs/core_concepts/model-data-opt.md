# 📊 Model / Data / Config

OrcaGym 将 MuJoCo 模型信息分为清晰的层级。Euler 体系引入了新的 `OrcaGymDataView`（完整只读状态视图）和 `SimConfig`（typed 求解器配置），替代老体系的 `OrcaGymData` 和直接 `opt.*` 访问。

## 两者对比

| 维度 | Euler 体系（推荐） | Local 体系（老） |
|------|------------------|-----------------|
| 模型信息 | `env.model` → `OrcaGymModel` | `env.model` / `env.gym.model` → `OrcaGymModel` |
| 动态状态 | `env.data` → `OrcaGymDataView`（完整只读视图） | `env.data` / `env.gym.data` → `OrcaGymData`（仅 5 字段） |
| 求解器配置 | `env.sim_config` → `SimConfig`（typed property） | `env.gym.opt` → `OrcaGymOptConfig`（快照） |

`OrcaGymModel` 两套体系**原样复用**，设计不变。

---

## OrcaGymModel — 静态模型信息

`OrcaGymModel` 包含所有**在仿真过程中不变**的信息：

```python
# 访问模型
model = env.model        # 两套体系均可直接用 env.model

# 维度信息
print(model.nq)          # 广义坐标数
print(model.nv)          # 自由度数
print(model.nu)          # 执行器数
print(model.nbody)       # body 总数
print(model.njnt)        # 关节总数
print(model.neq)         # 等式约束总数

# 名称到 ID 的映射
body_id = model.body_name2id("base_link")
joint_id = model.joint_name2id("shoulder")
actuator_id = model.actuator_name2id("shoulder_actuator")

# 获取执行器控制范围（用于构建 action_space）
ctrl_range = model.get_actuator_ctrlrange()  # shape: (nu, 2)

# 列出所有 body
body_names = model.get_body_names()
```

### Model 中存储的字典

| 字典 | 方法 | 内容 |
|------|------|------|
| Body | `init_body_dict` / `get_body_dict` | 质量、惯性、父子关系、位姿 |
| Joint | `init_joint_dict` / `get_joint_dict` | 类型、范围、轴、刚度、阻尼 |
| Actuator | `init_actuator_dict` / `get_actuator_dict` | 控制范围、齿轮比、传输类型 |
| Geom | `init_geom_dict` / `get_geom_dict` | 形状、摩擦、碰撞参数 |
| Site | `init_site_dict` / `get_site_dict` | 标记点位置、尺寸 |
| Sensor | `init_sensor_dict` / `gen_sensor_dict` | 类型、维度、数据地址 |
| Eq | `init_eq_list` / `get_eq_list` | 等式约束类型、目标对象 |
| Mocap | `init_mocap_dict` / `get_mocap_dict` | mocap body 映射 |
| Mesh | `init_mesh_dict` | 网格文件路径、缩放 |

---

## OrcaGymDataView — 完整状态只读视图（Euler 体系）

`OrcaGymDataView` 是 Euler 体系的状态容器，**替代直接访问 `_mjData`**。提供零拷贝只读视图，字段比老体系 `OrcaGymData` 更完整。

```python
data = env.data        # Euler 体系：env.data 就是 OrcaGymDataView

# 核心状态（零拷贝视图，不需要手动 update_data）
qpos = data.qpos               # (nq,) 广义坐标
qvel = data.qvel               # (nv,) 广义速度
qacc = data.qacc               # (nv,) 广义加速度
qfrc_bias = data.qfrc_bias     # (nv,) 偏置力
time = data.time               # 仿真时间（标量）

# 扩展字段（老体系 OrcaGymData 没有的）
xfrc_applied = data.xfrc_applied       # 外力（只读！写入用 apply_body_force）
actuator_force = data.actuator_force   # 执行器力
cfrc_ext = data.cfrc_ext              # 外部约束力 (nbody, 6)
contact = data.contact                 # 接触列表

# 按名称查询 body/site（无需知道 id）
body_pos = data.body_xpos("torso_link")       # (3,) 世界坐标
body_quat = data.body_xquat("torso_link")    # (4,) [w,x,y,z]
body_vel = data.body_cvel("torso_link")       # (6,) [ang(3), lin(3)]
site_pos = data.site_xpos("imu")             # (3,)
geom_pos = data.geom_xpos("box_geom")        # (3,)
mass = data.body_subtree_mass("torso_link")   # float
```

### DataView 更新的时机（Euler 体系）

```
do_simulation(ctrl, n_frames)
  └─▶ step_with_coupling()         # 内部 mj_step
  └─▶ sync_to_view()              # _mjData → DataView 零拷贝同步

mj_forward()
  └─▶ 派生量（body/site 位姿）已更新
  └─▶ sync_to_view()              # 若需要从 env.data 读取更新后的值
```

> ⚠️ **重要**：`do_simulation()` 返回后 `env.data` 已自动同步。手动调用 `mj_forward()`/`mj_step()` 后如需从 `env.data` 读取，需调用 `env._gym.sync_to_view()`（内部方法）。

### 新老体系状态读取对比

| 操作 | Euler 体系 ✅ | Local 体系 ⚠️ |
|------|-------------|-------------|
| 读 qpos | `env.data.qpos` | `env.data.qpos` 或 `env.gym._mjData.qpos` |
| 读 body 位置 | `env.data.body_xpos("link1")` | `env.gym._mjData.body(id).xpos` |
| 读 cvel | `env.data.body_cvel("link1")` | `env.gym._mjData.cvel[id]` |
| 读 xfrc_applied | `env.data.xfrc_applied`（只读） | `env.gym._mjData.xfrc_applied` |
| 手动同步数据 | `env._gym.sync_to_view()` | `env.gym.update_data()` |

---

## SimConfig — 求解器配置（Euler 体系）

`SimConfig` 提供 typed 的 MuJoCo 求解器参数读写接口，**替代直接访问 `_mjModel.opt.*`**。修改在下次 `mj_step` 时生效。

```python
sim_config = env.sim_config    # Euler 体系：直接通过 env 访问

# 读写参数
sim_config.timestep = 0.002     # 物理时间步长
sim_config.iterations = 100     # 求解器迭代次数
sim_config.integrator = 1       # 积分器（0=Euler, 1=RK4）
sim_config.gravity = np.array([0., 0., -9.81])  # 重力

# 批量设置
sim_config.load_from_dict({
    "integrator": 0,
    "iterations": 100,
})

# 导出
config_dict = sim_config.to_dict()
```

### 新老体系配置对比

| 操作 | Euler 体系 ✅ | Local 体系 ⚠️ |
|------|-------------|-------------|
| 设置 timestep | `env.sim_config.timestep = 0.002` | `env.gym._mjModel.opt.timestep = 0.002` |
| 设置 iterations | `env.sim_config.iterations = 100` | `env.gym._mjModel.opt.iterations = 100` |
| 批量设置 | `env.sim_config.load_from_dict({...})` | 30 行逐个 `opt.*` 赋值 |

---

## OrcaGymData — 老体系动态状态（维护模式）

> ⚠️ 仅老体系 `OrcaGymLocalEnv` 使用。Euler 体系使用 `OrcaGymDataView`。

```python
# 老体系
data = env.data        # 或 env.gym.data

qpos = data.qpos.copy()      # (nq,) 广义坐标
qvel = data.qvel.copy()      # (nv,) 广义速度
qacc = data.qacc.copy()      # (nv,) 广义加速度
qfrc_bias = data.qfrc_bias.copy()  # (nv,) 偏置力
time = data.time              # 仿真时间（标量）
```

### 老体系 Data 更新时机

```
mj_step() / do_simulation()
  └─▶ update_data()
       ├─▶ _qpos_cache[:] = _mjData.qpos
       ├─▶ _qvel_cache[:] = _mjData.qvel
       └─▶ time = _mjData.time
```

> ⚠️ 老体系中，每次读取 `env.data.*` 前应确保已经调用了 `update_data()`，否则可能读到过时的值。Euler 体系中 `do_simulation()` 自动同步。

---

## OrcaGymOptConfig — 老体系 opt 配置快照（维护模式）

> ⚠️ 仅老体系使用。Euler 体系使用 `SimConfig`。

```python
# 老体系
opt = env.gym.opt      # OrcaGymOptConfig 实例

print(opt.timestep)    # 单步物理时间
print(opt.solver)      # 求解器类型
print(opt.gravity)     # 重力向量
```

### 老体系修改 opt 参数

```python
# 修改时间步长
env.gym.set_time_step(0.002)

# 批量设置
env.gym.opt.gravity = [0., 0., -9.81]
env.gym.set_opt_config()  # 将 self.opt 写入 _mjModel.opt
```

---

## 环境时间步长

两种体系计算方式不同：

```python
# Euler 体系
env.dt = env.sim_config.timestep * env.frame_skip

# Local 体系（老）
env.dt = env.gym.opt.timestep * env.frame_skip
```

控制频率：`control_hz = 1.0 / env.dt`

例如 `timestep = 0.001, frame_skip = 20` → `dt = 0.020s, control_hz = 50 Hz`

---

## 关节类型与 qpos/qvel 维度

不同关节类型在 `qpos` 和 `qvel` 中占用不同数量的元素：

| 关节类型 | qpos 大小 | qvel 大小 | 示例 |
|----------|-----------|-----------|------|
| FREE | 7 (3 pos + 4 quat) | 6 (3 lin + 3 ang) | 自由飞行体 |
| BALL | 4 (quaternion) | 3 (angular velocity) | 球关节 |
| HINGE | 1 (angle) | 1 (angular velocity) | 旋转关节 |
| SLIDE | 1 (displacement) | 1 (linear velocity) | 滑动关节 |

```python
from orca_gym.core.orca_gym_local import get_qpos_size, get_dof_size

# 查询特定关节在 qpos 中的长度
joint_id = model.joint_name2id("shoulder")
joint_type = model.get_joint_byname("shoulder")["Type"]
qpos_size = get_qpos_size(joint_type)  # 返回 1, 3, 4 或 7
dof_size = get_dof_size(joint_type)    # 返回 1, 3 或 6
```
