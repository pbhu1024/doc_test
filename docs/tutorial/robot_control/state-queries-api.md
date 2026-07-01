# 📡 状态查询 API — 读取关节、Body、传感器

本节介绍如何使用 OrcaGym Euler 体系的**状态查询 API**，覆盖关节状态、Body 位姿、传感器、执行器力矩、接触信息等。

> 完整可运行代码见 [OrcaPlayground examples/euler/04_query_api/](https://github.com/OrcaGym/OrcaPlayground)。

---

## 查询 API 总览

OrcaGymEulerEnv 提供以下公共查询方法（全部按名称访问，无需 id）：

| 类别 | 方法 | 返回类型 |
|------|------|----------|
| **关节** | `query_joint_qpos(names)` | `dict[str, np.ndarray]` |
| | `query_joint_qvel(names)` | `dict[str, np.ndarray]` |
| | `query_joint_qacc(names)` | `dict[str, np.ndarray]` |
| | `jnt_qposadr(name)` | `int` |
| | `jnt_dofadr(name)` | `int` |
| **Body** | `get_body_xpos_xmat_xquat(names)` | `dict[str, dict]` |
| | `get_body_xpos_xmat_xquat_xvel(names)` | `dict[str, dict]` |
| **Site** | `query_site_pos_and_mat(names)` | `dict[str, dict]` |
| | `query_site_xvalp_xvalr(names)` | `tuple[dict, dict]` |
| **传感器** | `query_sensor_data(names)` | `dict[str, np.ndarray]` |
| **执行器** | `query_actuator_torques(names)` | `dict[str, np.ndarray]` |
| **接触** | `query_contact_simple()` | `list[dict]` |
| | `query_contact_force(ids)` | `dict[int, np.ndarray]` |
| **质量** | `body_subtree_mass(name)` | `float` |
| **基座变换** | `query_position_body_B(ee, base)` | `np.ndarray(3,)` |

---

## 关节查询

### `query_joint_qpos` / `query_joint_qvel` / `query_joint_qacc`

查询指定关节的位置/速度/加速度：

```python
# 准备关节名称（带 agent 前缀）
agent = "g1"
joint_names = [f"{agent}_left_knee_joint", f"{agent}_right_knee_joint"]

# 查询
qpos = env.query_joint_qpos(joint_names)
qvel = env.query_joint_qvel(joint_names)

# 结果：dict 按名称索引，每个值是对应关节的 slice
print(qpos[f"{agent}_left_knee_joint"])   # array([0.523]) — 左膝角度
print(qvel[f"{agent}_right_knee_joint"])  # array([-0.1])  — 右膝角速度
```

### 与 `env.data.qpos` 的关系

`query_joint_qpos` 通过 `jnt_qposadr` 按关节地址从 `data.qpos` 切片：

```python
# query_joint_qpos 内部等价于：
result = {}
for jn in joint_names:
    addr = env.jnt_qposadr(jn)
    result[jn] = env.data.qpos[addr:addr + 1]  # 铰链关节长度为 1
```

> **注意**：`env.data.qpos` 是**全局**数组（包含所有 body 的 qpos）。在多 body 场景中，
> 不要直接 `data.qpos[7:]` 访问 G1 关节，应通过 `jnt_qposadr` 按各关节地址逐段拼接。

### `jnt_qposadr` / `jnt_dofadr`

获取关节在 qpos/qvel 中的起始地址：

```python
addr = env.jnt_qposadr("g1_left_knee_joint")  # 如 10
dof_addr = env.jnt_dofadr("g1_left_knee_joint")  # 如 7

# 用于从 data.qpos 中按地址切片
knee_angle = env.data.qpos[addr]  # 铰链关节 qpos 长度 = 1
```

---

## Body 位姿查询

### `get_body_xpos_xmat_xquat`

查询指定 body 的世界坐标位姿：

```python
pelvis = env.get_body_xpos_xmat_xquat(["g1_pelvis", "g1_torso_link"])

# 返回格式：
# {
#     "g1_pelvis": {
#         "xpos": np.array([0.0, 0.0, 0.78]),   # 世界坐标位置 (3,)
#         "xmat": np.array([...]),                 # 旋转矩阵扁平存储 (9,)
#         "xquat": np.array([1.0, 0, 0, 0]),     # 四元数 [w, x, y, z] (4,)
#     },
#     "g1_torso_link": { ... }
# }

# 常用访问模式
pelvis_z = float(pelvis["g1_pelvis"]["xpos"][2])  # pelvis 高度
```

### `get_body_xpos_xmat_xquat_xvel`

比上面多返回线速度：

```python
body = env.get_body_xpos_xmat_xquat_xvel(["g1_pelvis"])
# 额外包含 "xvel": np.array([vx, vy, vz])
```

---

## 传感器查询

### `query_sensor_data`

查询 MuJoCo 传感器数据（加速度计、陀螺仪等）：

```python
sensor_data = env.query_sensor_data(["g1_imu_quat", "g1_imu_gyro"])

imu_quat = sensor_data["g1_imu_quat"]   # array([w, x, y, z]) — 姿态四元数
imu_gyro = sensor_data["g1_imu_gyro"]   # array([gx, gy, gz]) — 角速度
```

---

## 执行器力矩查询

### `query_actuator_torques`

```python
actuator_names = ["g1_left_knee", "g1_right_knee"]
torques = env.query_actuator_torques(actuator_names)

left_knee_torque = torques["g1_left_knee"]  # array([torque_value])
```

---

## 接触查询

### `query_contact_simple` + `query_contact_force`

```python
# 1. 获取接触列表
contacts = env.query_contact_simple()
# 返回: [{"geom1": ..., "geom2": ..., "dist": ..., ...}, ...]

print(f"接触数: {len(contacts)}")

# 2. 获取接触力
if contacts:
    contact_ids = list(range(len(contacts)))
    forces = env.query_contact_force(contact_ids)
    # 返回: {0: array([normal, shear1, shear2, ...]), 1: ...}

    max_normal = max(abs(f[0]) for f in forces.values())
    print(f"最大法向力: {max_normal:.1f}N")
```

---

## 基座坐标系变换

### `query_position_body_B`

计算 body 在**基座坐标系**中的位置（纯 NumPy 变换，不依赖 MuJoCo）：

```python
# torso_link 在 pelvis 坐标系中的位置
torso_in_pelvis = env.query_position_body_B("g1_torso_link", "g1_pelvis")
# 返回: array([x, y, z])

print(f"躯干在骨盆上方: {torso_in_pelvis[2]:.3f}m")  # z 分量应 > 0
```

### `query_site_xvalp_xvalr`

查询 site 的世界坐标速度：

```python
xvalp, xvalr = env.query_site_xvalp_xvalr(["g1_imu"])
# xvalp: {"g1_imu": array([vx, vy, vz])}    — 线速度
# xvalr: {"g1_imu": array([wx, wy, wz])}    — 角速度
```

---

## 质量查询

### `body_subtree_mass`

```python
torso_mass = env.body_subtree_mass("g1_torso_link")
print(f"躯干子树总质量: {torso_mass:.2f}kg")
```

---

## 从 `env.data` 直接读取

`env.data` 是 `OrcaGymDataView`，提供零拷贝只读视图：

```python
# 基本状态（零拷贝）
env.data.qpos          # (nq,)  广义坐标
env.data.qvel          # (nv,)  广义速度
env.data.qacc          # (nv,)  广义加速度
env.data.time          # float  仿真时间
env.data.qfrc_bias     # (nv,)  偏置力

# 扩展状态
env.data.xfrc_applied[body_id, :3]   # 读取 body 上施加的外力
env.data.mocap_pos("g1_mocap_body")   # mocap 位置
env.data.mocap_quat("g1_mocap_body")  # mocap 四元数

# Body site 查询（按名称）
env.data.body_xpos("g1_pelvis")    # (3,) 世界位置
env.data.site_xpos("g1_imu")       # (3,) site 位置
```

> ⚠️ `env.data.qpos` 是**零拷贝视图**。若需保存历史值，调用 `.copy()`。

---

## 完整验证示例

下面是一个完整的状态查询验证脚本骨架（离线模式）：

```python
"""查询 API 验证脚本骨架"""

import numpy as np
from orca_gym.environment.euler.orca_gym_euler_env import OrcaGymEulerEnv


class QueryDemoEnv(OrcaGymEulerEnv):
    def __init__(self, model_xml_path):
        super().__init__(
            frame_skip=20,
            orcagym_addr="localhost:50051",
            agent_names=["g1"],
            time_step=0.001,
            model_xml_path=model_xml_path,
            skip_grpc_load=True,
        )

    def step(self, action):
        self.do_simulation(action, self.frame_skip)
        return self._get_obs(), 0.0, False, False, {}

    def reset_model(self):
        self.set_joint_qpos(self.init_qpos)
        self.set_joint_qvel(self.init_qvel)
        self.mj_forward()
        self._sync_view()
        return self._get_obs(), {}

    def _get_obs(self):
        return self.data.qpos.copy()

    def run_queries(self):
        """演示全套查询 API。"""
        self.reset()
        agent = self.agent_name

        # 1. 关节查询
        knee = f"{agent}_left_knee_joint"
        qpos = self.query_joint_qpos([knee])
        print(f"左膝角度: {qpos[knee]}")

        # 2. Body 位姿
        pelvis = self.get_body_xpos_xmat_xquat([f"{agent}_pelvis"])
        print(f"pelvis 高度: {pelvis[f'{agent}_pelvis']['xpos'][2]:.3f}m")

        # 3. 传感器
        imu = self.query_sensor_data([f"{agent}_imu_quat"])
        print(f"IMU 四元数: {imu[f'{agent}_imu_quat']}")

        # 4. 接触
        contacts = self.query_contact_simple()
        print(f"接触数: {len(contacts)}")

        # 5. 质量
        mass = self.body_subtree_mass(f"{agent}_torso_link")
        print(f"躯干质量: {mass:.2f}kg")

        # 6. 基座变换
        torso_B = self.query_position_body_B(
            f"{agent}_torso_link", f"{agent}_pelvis"
        )
        print(f"躯干在骨盆坐标系: {torso_B}")

        self.close()
```

---

## 常见问题

### `KeyError: 'g1_left_knee_joint'`

查询时关节名不完整。确保使用带 agent 前缀的完整名称：`"{agent_name}_{joint_suffix}"`。

### `data.qpos[7:]` 得到错误值

多 body 场景中不能简单切片。G1 关节的 qpos 地址通过 `jnt_qposadr` 获取，逐个拼接。

### `query_contact_force` 返回空

确保场景中确实有接触（如机器人站在地面上）。离线刚加载时可能还没有接触。

---

## 下一步

掌握了状态查询，接下来学习如何**施加外力和写入状态**：[🔄 外力应用](../physics/force-apply.md)。
