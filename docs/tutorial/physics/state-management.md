# 📐 状态管理

管理 MuJoCo 仿真中的状态（qpos/qvel/qacc）是正确使用 OrcaGym 的关键。

## 状态数据布局

```
qpos (广义坐标):
  [body0_free_pos_xyz, body0_free_quat_wxyz, joint0_qpos, joint1_qpos, ...]
  长度 = model.nq

qvel (广义速度):
  [body0_free_lin_vel, body0_free_ang_vel, joint0_qvel, joint1_qvel, ...]
  长度 = model.nv

qacc (广义加速度):
  与 qvel 相同布局
  长度 = model.nv
```

## 获取状态

### 获取全局状态

```python
# 获取全部（注意：使用 copy() 避免引用问题）
qpos = env.data.qpos.copy()
qvel = env.data.qvel.copy()
qacc = env.data.qacc.copy()
qfrc_bias = env.data.qfrc_bias.copy()
time = env.data.time
```

### 获取特定关节状态

```python
# 按名称查询特定关节
joint_names = ["shoulder_joint", "elbow_joint", "wrist_joint"]

# 位置
qpos_dict = env.gym.query_joint_qpos(joint_names)
# → {"shoulder_joint": array([0.5]), "elbow_joint": array([-0.3]), ...}

# 速度
qvel_dict = env.gym.query_joint_qvel(joint_names)

# 加速度
qacc_dict = env.gym.query_joint_qacc(joint_names)
```

### 获取关节索引信息

```python
# 查询关节在全局数组中的偏移
qpos_offsets, qvel_offsets, qacc_offsets = env.gym.query_joint_offsets(joint_names)

# 查询关节在全局数组中的长度
qpos_lengths, qvel_lengths, qacc_lengths = env.gym.query_joint_lengths(joint_names)

# 单个关节的地址
adr = env.gym.jnt_qposadr("shoulder_joint")  # qpos 中的起始索引
adr = env.gym.jnt_dofadr("shoulder_joint")   # qvel/qacc 中的起始索引
```

## 设置状态

### 设置关节位置

```python
# 按名称设置特定关节
env.gym.set_joint_qpos({
    "shoulder_joint": np.array([0.5]),
    "elbow_joint": np.array([-0.3]),
})

# ⚠️ 重要：设置后必须 forward
env.gym.mj_forward()
env.gym.update_data()
```

### 设置关节速度

```python
env.gym.set_joint_qvel({
    "shoulder_joint": np.array([0.1]),
    "elbow_joint": np.array([-0.05]),
})

env.gym.mj_forward()
env.gym.update_data()
```

### 重置到初始状态

```python
# 完全重置
env.gym.load_initial_frame()  # mj_resetData
env.gym.update_data()
```

## 获取 Body 位姿

```python
# 查询 body 的世界坐标位姿
body_dict = env.gym.query_body_xpos_xmat_xquat(["base_link", "ee_link"])

for name, pose in body_dict.items():
    pos = pose["Pos"]      # np.array([x, y, z])
    mat = pose["Mat"]      # np.array(9) — 3x3 矩阵按行展开
    quat = pose["Quat"]    # np.array([w, x, y, z])
```

## 获取 Sensor 数据

```python
# 查询传感器数据
sensor_data = env.gym.query_sensor_data([
    "accelerometer",
    "gyro",
    "force_torque",
])

accel = sensor_data["accelerometer"]  # (3,)
gyro = sensor_data["gyro"]            # (3,)
ft = sensor_data["force_torque"]      # (6,)
```

## 状态同步黄金法则

> ⚠️ **修改状态 → mj_forward → update_data → 再读数据**

```python
# ✅ 正确的状态修改流程
env.gym.set_joint_qpos(new_qpos)   # 修改
env.gym.mj_forward()                # 刷新派生量
env.gym.update_data()               # 同步到 data 对象
current_qpos = env.data.qpos.copy() # 读取（用 copy）

# ✅ 正确的 step 后读取流程
env.do_simulation(ctrl, n_frames)   # 内部调用了 update_data
current_qpos = env.data.qpos.copy() # 直接读即可
```

## 常见错误

| 错误 | 后果 | 修正 |
|------|------|------|
| 修改 qpos 后不 forward | 位姿/传感器 NaN | 加 `mj_forward()` |
| 不 update_data 就读 data | 读到旧数据 | 加 `update_data()` |
| 不用 copy 就保存引用 | 数据被后续覆盖 | 用 `data.qpos.copy()` |
| 数组维度不对 | ValueError | 用 `query_joint_lengths` 检查 |
