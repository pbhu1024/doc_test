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
# env.data 是 OrcaGymDataView（零拷贝视图）
qpos = env.data.qpos # (nq,) — 零拷贝视图
qvel = env.data.qvel # (nv,)
qacc = env.data.qacc # (nv,)
qfrc_bias = env.data.qfrc_bias # (nv,)
time = env.data.time # 标量

# — env.data 是 OrcaGymData，注意 .copy()
qpos = env.data.qpos.copy()
qvel = env.data.qvel.copy()
qacc = env.data.qacc.copy()
qfrc_bias = env.data.qfrc_bias.copy()
time = env.data.time
```

### 获取特定关节状态

```python
# 按名称查询特定关节（通用）
joint_names = ["shoulder_joint", "elbow_joint", "wrist_joint"]

# 位置
qpos_dict = env.query_joint_qpos(joint_names)
# → {"shoulder_joint": array([0.5]), "elbow_joint": array([-0.3]), ...}

# 速度
qvel_dict = env.query_joint_qvel(joint_names)

# 加速度
qacc_dict = env.query_joint_qacc(joint_names)
```

### 获取关节索引信息

```python
# 查询关节在全局数组中的偏移
offsets = env.query_joint_offsets(joint_names)
lengths = env.query_joint_lengths(joint_names)

# 单个关节的地址
adr = env.jnt_qposadr("shoulder_joint") # qpos 中的起始索引
adr = env.jnt_dofadr("shoulder_joint") # qvel/qacc 中的起始索引
```

## 设置状态

### 设置关节位置

```python
# 全量设置（当前阶段实现）
env.set_joint_qpos(new_qpos_array)

# — 按名称设置
env.set_joint_qpos({
 "shoulder_joint": np.array([0.5]),
 "elbow_joint": np.array([-0.3]),
})

# ⚠️ 重要：设置后必须 forward
env.mj_forward()
```

### 设置关节速度

```python
env.set_joint_qvel(new_qvel_array)
env.mj_forward()
```

### 重置到初始状态

```python
# 通过 env.reset() 或直接在 reset_model 中用 set_joint_qpos
# 初始状态在 init_qpos/init_qvel 中
qpos = self.init_qpos + noise
self.set_joint_qpos(qpos)
self.mj_forward()
```

## 获取 Body 位姿

```python
# 通过 env.data 按名称查询
body_pos = env.data.body_xpos("base_link") # (3,)
body_quat = env.data.body_xquat("base_link") # (4,) [w,x,y,z]
body_mat = env.data.body_xmat("base_link") # (9,) 3×3 按行展开
body_vel = env.data.body_cvel("base_link") # (6,) [ang(3), lin(3)]

# 批量查询
body_dict = env.get_body_xpos_xmat_xquat(["base_link", "ee_link"])
for name, pose in body_dict.items():
 pos = pose["xpos"] # np.array([x, y, z])
 mat = pose["xmat"] # np.array(9) — 3x3 矩阵按行展开
 quat = pose["xquat"] # np.array([w, x, y, z])
```

## 获取 Sensor 数据

```python
# 查询传感器数据
sensor_data = env.query_sensor_data([
 "imu_accelerometer",
 "imu_gyro",
 "force_torque_sensor",
])

accel = sensor_data["imu_accelerometer"] # (3,)
gyro = sensor_data["imu_gyro"] # (3,)
ft = sensor_data["force_torque_sensor"] # (6,)
```

## 状态同步黄金法则

> ⚠️ **修改状态 → mj_forward → 同步数据 → 再读数据**

```python
# ✅ 正确的状态修改流程
env.set_joint_qpos(new_qpos) # 修改
env.mj_forward() # 刷新派生量
env._sync_view() # 同步到 DataView
current_qpos = env.data.qpos # 读取（零拷贝视图，反映最新值）

# ✅ step 后自动同步
env.do_simulation(ctrl, n_frames) # 内部已调用 sync_to_view()
current_qpos = env.data.qpos # 直接读即可

# ✅ — 正确的状态修改流程
env.gym.set_joint_qpos(joint_dict) # 修改
env.gym.mj_forward() # 刷新派生量
env.gym.update_data() # 同步到 data 对象
current_qpos = env.data.qpos.copy() # 读取（用 copy）
```

## 常见错误

| 错误 | 后果 | 修正 |
|------|------|------|
| 修改 qpos 后不 forward | 位姿/传感器 NaN | 加 `mj_forward()` |
| 不同步数据就读 data | 读到旧数据 | 调 `_sync_view()` 同步数据 |
| 不用 copy 就保存引用 | 数据被后续覆盖 | 需要 `data.qpos.copy()` |
| 数组维度不对 | ValueError | 用 `query_joint_lengths` 检查 |
| Euler 中访问 `env.gym` | AttributeError | 用 `env._gym`（内部）或走公共 API |
