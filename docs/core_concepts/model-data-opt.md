# 📊 Model / Data / Opt

OrcaGym 将 MuJoCo 模型信息分为三个清晰的层级。

## OrcaGymModel — 静态模型信息

`OrcaGymModel` 包含所有**在仿真过程中不变**的信息：

```python
# 访问模型
model = env.model        # 或 env.gym.model

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

## OrcaGymData — 动态仿真状态

`OrcaGymData` 存储**每步都在变化**的仿真数据：

```python
data = env.data        # 或 env.gym.data

# 核心状态（注意：应使用 .copy() 避免被后续更新覆盖）
qpos = data.qpos.copy()      # (nq,) 广义坐标
qvel = data.qvel.copy()      # (nv,) 广义速度
qacc = data.qacc.copy()      # (nv,) 广义加速度
qfrc_bias = data.qfrc_bias.copy()  # (nv,) 偏置力
time = data.time              # 仿真时间 (标量)
```

### Data 更新的时机

```
mj_step() / do_simulation()
  └─▶ update_data()
       ├─▶ _qpos_cache[:] = _mjData.qpos
       ├─▶ _qvel_cache[:] = _mjData.qvel
       ├─▶ _qacc_cache[:] = _mjData.qacc
       ├─▶ qfrc_bias = query_qfrc_bias()
       └─▶ time = _mjData.time
```

> ⚠️ **重要**：每次读取 `env.data.*` 前应确保已经调用了 `update_data()`，否则可能读到过时的值。

## OrcaGymOptConfig — 物理配置

`OrcaGymOptConfig` 存储 MuJoCo `opt` 的参数快照：

```python
opt = env.gym.opt      # OrcaGymOptConfig 实例

# 时间相关
print(opt.timestep)    # 单步物理时间（如 0.001）

# 求解器配置
print(opt.solver)      # 求解器类型
print(opt.iterations)  # 迭代次数

# 物理参数
print(opt.gravity)     # 重力向量 [0, 0, -9.81]
print(opt.density)     # 密度
print(opt.viscosity)   # 粘度

# 接触参数
print(opt.o_margin)    # 接触边距
print(opt.o_solref)    # 接触求解器参数 (刚度, 阻尼)
print(opt.o_solimp)    # 接触求解器参数 (阻尼比, 宽度)
print(opt.o_friction)  # 摩擦参数
```

### opt 与环境时间的关系

```python
# 策略控制周期
env.dt = env.gym.opt.timestep * env.frame_skip

# 控制频率
control_hz = 1.0 / env.dt

# 例如：
# timestep = 0.001, frame_skip = 20
# → dt = 0.020s, control_hz = 50 Hz
```

### 修改 opt 参数

```python
# 修改时间步长
env.gym.set_time_step(0.002)

# 批量设置
env.gym.set_opt_config()  # 将 self.opt 写入 _mjModel.opt
```

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
joint_type = env.gym._mjModel.jnt_type[joint_id]
qpos_size = get_qpos_size(joint_type)  # 返回 1, 3, 4 或 7
dof_size = get_dof_size(joint_type)    # 返回 1, 3 或 6
```
