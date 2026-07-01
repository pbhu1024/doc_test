# 📡 读取状态 — 关节、body、传感器

上一节我们只读了 `self.data.qpos` 和 `self.data.qvel`。这一节，你将学会用 OrcaGym 提供的**查询 API** 来获取更丰富的状态信息。

## 你能查到什么？

OrcaGym 提供了丰富的查询接口，按查询对象分类：

| 查询对象 | 方法 | 返回什么 |
|----------|------|----------|
| 关节 | `query_joint_qpos(names)` | 关节角度 |
| 关节 | `query_joint_qvel(names)` | 关节速度 |
| Body | `get_body_xpos_xmat_xquat(names)` | body 的位置 + 旋转矩阵 + 四元数 |
| Body | `env.data.body_xpos(name)` | body 世界位置（按名称） |
| Site | `query_site_pos_and_quat(names)` | site 的位置 + 四元数 |
| Site | `query_site_xvalp_xvalr(names)` | site 的线速度 + 角速度 |
| 传感器 | `query_sensor_data(names)` | 各类传感器的读数 |
| 执行器 | `query_actuator_torques(names)` | 执行器当前力矩 |

## 1. 查询关节状态

```python
def check_joints(env):
    """查询所有关节的位置和速度"""

    # 获取所有关节的名字列表
    joint_names = list(env.model.get_joint_dict().keys())
    print(f"共有 {len(joint_names)} 个关节")

    # 按名称查询位置
    qpos = env.query_joint_qpos(joint_names)
    # 返回: {"joint_0": array([0.52]), "joint_1": array([-0.31]), ...}

    # 按名称查询速度
    qvel = env.query_joint_qvel(joint_names)

    for name in joint_names:
        pos = qpos[name]
        vel = qvel[name]
        pos_str = f"{pos[0]:.3f}" if len(pos) == 1 else f"{pos}"
        print(f"  {name:20s}: pos={pos_str}, vel={vel}")

    return qpos, qvel
```

### 关节信息查询

```python
def inspect_joint(env, joint_name: str):
    """查看单个关节的详细信息"""
    info = env.model.get_joint_byname(joint_name)
    print(f"关节: {joint_name}")
    print(f"  类型: {info['Type']}")        # hinge / slide / free / ball
    print(f"  有限位: {info['Limited']}")    # 是否有关节限位
    if info['Limited']:
        print(f"  范围: [{info['Range'][0]:.3f}, {info['Range'][1]:.3f}] 弧度")

    # 查询该关节在全局数组中的地址
    qpos_addr = env.jnt_qposadr(joint_name)  # 在 qpos 数组中的起始位置
    dof_addr = env.jnt_dofadr(joint_name)    # 在 qvel 数组中的起始位置
    print(f"  qpos 地址: {qpos_addr}, qvel 地址: {dof_addr}")
```

## 2. 查询 Body 位姿

Body 是 MuJoCo 中的刚体。机器人上的每个连杆、场景中的每个物体都是一个 body。

```python
def check_body_pose(env):
    """查询关键 body 的位置和姿态"""

    # 获取所有 body 的名字
    body_names = env.model.get_body_names()
    print(f"共有 {len(body_names)} 个 body:")
    for name in list(body_names)[:10]:
        print(f"  - {name}")

    # 按名称逐个查询（推荐）
    for name in ["robot_0_base_link", "robot_0_ee_link"]:
        pos = env.data.body_xpos(name)       # (3,) 世界坐标
        quat = env.data.body_xquat(name)     # (4,) [w,x,y,z]
        print(f"\n{name}:")
        print(f"  位置: [{pos[0]:.3f}, {pos[1]:.3f}, {pos[2]:.3f}] m")
        print(f"  姿态: [{quat[0]:.3f}, {quat[1]:.3f}, {quat[2]:.3f}, {quat[3]:.3f}]")

    # 批量查询
    body_dict = env.get_body_xpos_xmat_xquat(["robot_0_base_link", "robot_0_ee_link"])
    for name, pose in body_dict.items():
        print(f"{name}: pos={pose['xpos']}, quat={pose['xquat']}")
```

## 3. 查询 Site

Site 是 MuJoCo 中的标记点，通常用于标记**末端执行器**（手指尖）、**目标点**等。

```python
def check_end_effector(env):
    """查询末端执行器的位姿和速度"""

    # 获取 site 名字（注意加上 agent 前缀）
    ee_site = env.site("end_effector")  # 自动加前缀 → "robot_0_end_effector"

    # 查询位姿
    site_data = env.query_site_pos_and_quat([ee_site])
    ee_info = site_data[ee_site]
    ee_pos = ee_info["xpos"]    # [x, y, z]
    ee_quat = ee_info["xquat"]  # [w, x, y, z]

    print(f"末端执行器 (site: {ee_site}):")
    print(f"  位置: [{ee_pos[0]:.3f}, {ee_pos[1]:.3f}, {ee_pos[2]:.3f}]")

    # 查询速度（线速度 + 角速度）
    linear_vel, angular_vel = env.query_site_xvalp_xvalr([ee_site])
    print(f"  线速度: {linear_vel[ee_site]}")
    print(f"  角速度: {angular_vel[ee_site]}")

    return ee_pos, ee_quat
```

### Site 相对于基座的位姿

机器人的基座可能在移动。用 `_B` 后缀的方法获取**相对于基座**的位姿：

```python
def check_ee_relative_to_base(env):
    """查询末端相对于机器人基座的位置"""
    ee_site = env.site("end_effector")
    base_body = env.body("base_link")

    site_in_base = env.query_site_pos_and_quat_B(
        [ee_site], [base_body]
    )
    ee_rel = site_in_base[ee_site]
    print(f"末端相对于基座: pos={ee_rel['xpos']}, quat={ee_rel['xquat']}")
```

## 4. 查询传感器

如果 MuJoCo 模型中有传感器（加速度计、陀螺仪、力传感器等），可以这样读：

```python
def read_sensors(env):
    """读取所有传感器数据"""

    # 获取所有传感器名称
    sensor_names = list(env.model.gen_sensor_dict().keys())
    print(f"传感器列表 ({len(sensor_names)} 个):")
    for name in sensor_names:
        info = env.model.gen_sensor_dict()[name]
        print(f"  {name}: type={info['Type']}, dim={info['Dim']}")

    if len(sensor_names) == 0:
        print("  (当前模型没有传感器)")
        return

    # 批量查询
    sensor_data = env.query_sensor_data(sensor_names)
    for name, data in sensor_data.items():
        print(f"  {name}: {data}")

    return sensor_data
```

### 常用传感器类型

| MuJoCo 传感器类型 | 典型用途 | 数据维度 |
|-------------------|----------|----------|
| `accelerometer` | 测量 body 线加速度 | (3,) |
| `gyro` | 测量 body 角速度 | (3,) |
| `force` | 测量单轴力 | (1,) |
| `torque` | 测量单轴力矩 | (1,) |
| `force_torque` | 六维力/力矩 | (6,) |
| `jointpos` | 关节位置 | (1,) |
| `jointvel` | 关节速度 | (1,) |
| `touch` | 接触检测 | (1,) |

## 5. 查询执行器力矩

```python
def read_actuator_torques(env):
    """查看各关节当前承受的力矩"""
    actuator_names = [env.model.actuator_id2name(i) for i in range(env.model.nu)]
    torques = env.query_actuator_torques(actuator_names)
    for name, t in torques.items():
        print(f"  {name}: {t}")
```

## 6. 实用汇总：StateDumper

将上述查询整合成一个调试工具：

```python
class StateDumper:
    """调试工具：打印环境当前状态"""

    def __init__(self, env):
        self.env = env

    def dump(self):
        env = self.env
        print("=" * 60)
        print(f"仿真时间: {env.data.time:.3f}s")

        # 关节
        joint_names = list(env.model.get_joint_dict().keys())[:5]
        qpos = env.query_joint_qpos(joint_names)
        print("\n关节位置:")
        for name in joint_names:
            print(f"  {name}: {qpos[name]}")

        # 末端执行器
        ee_site = env.site("end_effector")
        try:
            sites = env.query_site_pos_and_quat([ee_site])
            ee_pos = sites[ee_site]["xpos"]
            print(f"\n末端位置: [{ee_pos[0]:.4f}, {ee_pos[1]:.4f}, {ee_pos[2]:.4f}]")
        except Exception:
            print("\n(无 end_effector site)")

        # 接触
        contacts = env.query_contact_simple()
        contact_count = len(contacts) if contacts else 0
        print(f"\n接触点数量: {contact_count}")

        print("=" * 60)


# 用法：在仿真循环中
dumper = StateDumper(env)
for i in range(100):
    env.step(action)
    if i % 50 == 0:
        dumper.dump()
```

## 状态更新的时机

```
mj_forward() 或 do_simulation()
        │
        ▼
  所有派生量更新（传感器、接触力、body位姿...）
        │
        ▼
  你的查询方法 ← 现在可以读到最新值
```

!!! warning "查询前必须先 forward/step"
    ```python
    # ✅ 正确
    env.do_simulation(ctrl, frame_skip)  # 内部做了 step + 自动同步
    pos = env.query_joint_qpos(["joint_0"])

    # ❌ 错误——读到的可能是旧数据
    env.set_joint_qpos(...)
    pos = env.query_joint_qpos(["joint_0"])  # 还没 forward！
    ```

## 下一步

能读状态了，接下来学习**让机器人动起来**：[🦾 让机器人动起来](move-a-joint.md)。
