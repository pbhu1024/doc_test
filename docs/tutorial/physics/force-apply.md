# 🔄 外力应用、状态写入与 IK — 控制仿真状态

本节介绍如何**施加外力、写入状态、使用雅可比矩阵和逆运动学（IK）**控制仿真。

> 完整可运行代码见 [OrcaPlayground examples/euler/05_force_apply/](https://github.com/OrcaGym/OrcaPlayground) 和 [06_jacobian/](https://github.com/OrcaGym/OrcaPlayground)。

---

## 前提

- 已完成 [📡 状态查询 API](../robot_control/state-queries-api.md)
- 理解 `qpos`/`qvel` 的含义和 `set_joint_qpos` + `mj_forward()` 的状态写入规范

---

## 外力应用

### `apply_body_force` — 对指定 body 施加力

```python
# 对 pelvis 施加 500N 向上的力（世界坐标系）
env.apply_body_force(
    "g1_pelvis",                          # body 名称
    force=np.array([0.0, 0.0, 500.0]),    # 力 (N)，世界坐标系
    torque=np.array([0.0, 0.0, 0.0]),     # 力矩 (N·m)
)
```

施加的力可以通过 `env.data.xfrc_applied` 读取（只读零拷贝视图）：

```python
body_id = env.model.body_name2id("g1_pelvis")
xfrc = env.data.xfrc_applied[body_id, :3]  # 前 3 个分量为力
print(f"施加的外力: {xfrc}")               # 应非零（如 [0, 0, 500]）
```

### `clear_body_force` — 清除指定 body 的外力

```python
env.clear_body_force("g1_pelvis")

# 验证：xfrc_applied 归零
xfrc = env.data.xfrc_applied[body_id, :3]
assert np.all(xfrc == 0)
```

### `clear_all_forces` — 清除所有外力

```python
env.clear_all_forces()
assert np.all(env.data.xfrc_applied == 0)
```

### 完整示例：施力抬起机器人

```python
# 1. 记录初始高度
pelvis = env.get_body_xpos_xmat_xquat(["g1_pelvis"])
z_before = float(pelvis["g1_pelvis"]["xpos"][2])

# 2. 施加向上力
env.apply_body_force("g1_pelvis",
                     force=np.array([0.0, 0.0, 500.0]),
                     torque=np.array([0.0, 0.0, 0.0]))

# 3. 步进仿真，让力生效（20 控制周期 = 0.4s）
ctrl = np.zeros(env.model.nu, dtype=np.float64)
for _ in range(20):
    env.do_simulation(ctrl, env.frame_skip)

# 4. 验证上升
pelvis = env.get_body_xpos_xmat_xquat(["g1_pelvis"])
z_after = float(pelvis["g1_pelvis"]["xpos"][2])
print(f"pelvis 高度变化: {z_before:.3f} → {z_after:.3f} (Δ={z_after - z_before:.3f}m)")

# 5. 清除外力
env.clear_body_force("g1_pelvis")
```

> **注意**：G1 人形机器人采用力控 motor 执行器，`ctrl=0` 时关节无力矩输出。
> 施力时应选择能够承受外力的 body（如 pelvis），避免对松软关节链上的 body 施力。

---

## 状态写入

### `set_joint_qpos` / `set_joint_qvel`

全量设置广义坐标和速度。这是**合规的状态写入方式**（W1 规则）：

```python
# 读取当前 qpos（需要 .copy() 因为 data.qpos 是只读零拷贝视图）
qpos = env.data.qpos.copy()
qvel = env.data.qvel.copy()

# 修改某个关节（通过 jnt_qposadr 定位）
knee_addr = env.jnt_qposadr("g1_left_knee_joint")
qpos[knee_addr] = 0.6    # 设置左膝弯曲 0.6 rad

# 写入
env.set_joint_qpos(qpos)
env.set_joint_qvel(qvel)
env.mj_forward()          # ← 必须！更新派生量（body 位姿、传感器等）
env._sync_view()          # 同步到 DataView
```

> ⚠️ **关键**：修改 qpos/qvel 后**必须调用 `mj_forward()`**，否则 `get_body_xpos_xmat_xquat`
> 等读到的仍是旧值。`env.data.qpos` 是只读零拷贝视图，不能直接写入。

### `set_geom_friction` — 设置摩擦系数

```python
# 设置 geom 的滑动、扭转、滚动摩擦
env.set_geom_friction({
    "g1_left_foot_geom": np.array([0.8, 0.005, 0.0001]),
})
# 参数: [slide_friction, torsional_friction, roll_friction]
```

### `set_mocap_pos_and_quat` — 设置 mocap body 位姿

Mocap body 是"虚拟 body"，不受物理约束，可自由移动：

```python
# 将 mocap body 移到目标位姿
env.set_mocap_pos_and_quat({
    "g1_TestMocapAnchor": {
        "pos": np.array([0.7, 0.0, 0.5]),          # 目标位置 [x, y, z]
        "quat": np.array([1.0, 0.0, 0.0, 0.0]),    # 目标四元数 [w, x, y, z]
    }
})

# 验证写入回读一致
read_pos = env.data.mocap_pos("g1_TestMocapAnchor")
read_quat = env.data.mocap_quat("g1_TestMocapAnchor")
print(f"回读位置: {read_pos}")   # 应与写入一致
```

> Mocap body 常与 **weld equality constraint** 配合使用，实现"拖拽"普通 body 的效果。
> 详见 [🔗 等式约束](equality-constraints.md)。

---

## 雅可比矩阵

### `mj_jacBody` — Body 雅可比

计算指定 body 的平移和旋转雅可比矩阵：

```python
nv = env.model.nv
jacp = np.zeros((3, nv))   # 平移雅可比 (3, nv)
jacr = np.zeros((3, nv))   # 旋转雅可比 (3, nv)

env.mj_jacBody(jacp, jacr, body_name="g1_pelvis")

# jacp @ qvel = body 世界坐标线速度
# jacr @ qvel = body 世界坐标角速度

# 形状验证
assert jacp.shape == (3, nv)
assert nv >= 35           # G1 自身 6 free + 29 关节
```

### `mj_jacSite` — Site 雅可比

```python
jacp_site = np.zeros((3, env.model.nv))
jacr_site = np.zeros((3, env.model.nv))

env.mj_jacSite(jacp_site, jacr_site, site_name="g1_imu")

# 验证：jacp_site @ qvel 应与 query_site_xvalp_xvalr 一致
xvalp, _ = env.query_site_xvalp_xvalr(["g1_imu"])
expected_vel = jacp_site @ env.data.qvel
print(f"site 线速度: {xvalp['g1_imu']}")
print(f"jacp @ qvel: {expected_vel}")
# 两者应在误差范围内一致（atol=1e-4）
```

---

## 逆运动学（IK）

下面是一个完整的**阻尼最小二乘 IK**（Damped Least Squares）示例，包含**两阶段**：

1. **预设微蹲姿态**：避免从完全伸直状态走反关节路径
2. **IK 迭代抬脚**：阻尼最小二乘 + 关节限位 clamp

```python
import numpy as np

# IK 参数
DAMPING = 0.05      # 阻尼系数（防止奇异，越大越稳定但收敛慢）
STEP = 0.05         # 每步最大关节变化
ITERS = 80          # 最大迭代次数
ATOL = 0.02         # 收敛阈值（m）

agent = env.agent_name
foot_body = f"{agent}_left_ankle_roll_link"

# ============================================================
# 准备：获取 G1 关节信息
# ============================================================

# G1 的 29 个旋转关节后缀
G1_ROT_JOINT_SUFFIXES = [
    "left_hip_pitch_joint", "left_hip_roll_joint", "left_hip_yaw_joint",
    "left_knee_joint", "left_ankle_pitch_joint", "left_ankle_roll_joint",
    "right_hip_pitch_joint", "right_hip_roll_joint", "right_hip_yaw_joint",
    "right_knee_joint", "right_ankle_pitch_joint", "right_ankle_roll_joint",
    "waist_yaw_joint", "waist_roll_joint", "waist_pitch_joint",
    "left_shoulder_pitch_joint", "left_shoulder_roll_joint", "left_shoulder_yaw_joint",
    "left_elbow_joint", "left_wrist_roll_joint", "left_wrist_pitch_joint", "left_wrist_yaw_joint",
    "right_shoulder_pitch_joint", "right_shoulder_roll_joint", "right_shoulder_yaw_joint",
    "right_elbow_joint", "right_wrist_roll_joint", "right_wrist_pitch_joint", "right_wrist_yaw_joint",
]

joint_names = [f"{agent}_{s}" for s in G1_ROT_JOINT_SUFFIXES]

# 获取各关节的 dof 地址（用于提取雅可比子矩阵）
dof_adrs = [env.jnt_dofadr(jn) for jn in joint_names]
qpos_adrs = [env.jnt_qposadr(jn) for jn in joint_names]

# G1 关节列范围（多 body 场景下，G1 关节 dof 不是 [7:]）
v_min, v_max = min(dof_adrs), max(dof_adrs)
g1_joint_cols = slice(v_min, v_max + 1)   # 从雅可比中取 G1 关节列

# 读取关节限位
jdict = env.model.get_joint_dict()
jnt_lo = np.array([
    jdict[jn]["Range"][0] if jdict[jn]["Limited"] else -np.inf
    for jn in joint_names
])
jnt_hi = np.array([
    jdict[jn]["Range"][1] if jdict[jn]["Limited"] else np.inf
    for jn in joint_names
])

# ============================================================
# 阶段 1：预设微蹲姿态（避免反关节路径）
# ============================================================

# G1 默认 qpos=0 时膝盖完全伸直，纯 DLS 会朝"后弯"方向走（反关节）。
# 预设膝盖前弯 + 髋前屈 + 踝背屈（补偿使脚底水平），IK 从已弯曲状态出发。
preset = {
    f"{agent}_left_knee_joint": 0.6,
    f"{agent}_left_hip_pitch_joint": -0.3,
    f"{agent}_left_ankle_pitch_joint": -0.3,
    f"{agent}_right_knee_joint": 0.6,
    f"{agent}_right_hip_pitch_joint": -0.3,
    f"{agent}_right_ankle_pitch_joint": -0.3,
}
qpos_preset = env.data.qpos.copy()
for jn, val in preset.items():
    qpos_preset[env.jnt_qposadr(jn)] = val
env.set_joint_qpos(qpos_preset)
env.mj_forward()

# ============================================================
# 阶段 2：IK 抬左脚（阻尼最小二乘 + 限位 clamp）
# ============================================================

# 目标：将左脚向上抬高约 10cm
foot_pos = env.get_body_xpos_xmat_xquat([foot_body])[foot_body]["xpos"]
target = foot_pos + np.array([0.0, 0.05, 0.10])  # y+5cm, z+10cm

jacr = np.zeros((3, env.model.nv))
for i in range(ITERS):
    # 计算脚部雅可比
    jacp_foot = np.zeros((3, env.model.nv))
    env.mj_jacBody(jacp_foot, jacr, body_name=foot_body)

    # 当前位置和误差
    cur = env.get_body_xpos_xmat_xquat([foot_body])[foot_body]["xpos"]
    delta = target - cur

    # 阻尼最小二乘: dq = J^T (J J^T + λ²I)^(-1) Δx
    jac_leg = jacp_foot[:, g1_joint_cols]
    dq = jac_leg.T @ np.linalg.inv(
        jac_leg @ jac_leg.T + DAMPING**2 * np.eye(3)
    ) @ delta

    # 更新 qpos（合规写入：复制 → 修改 G1 关节段 → set_joint_qpos → mj_forward）
    qpos = env.data.qpos.copy()
    for j, qadr in enumerate(qpos_adrs):
        qpos[qadr] = np.clip(qpos[qadr] + dq[j] * STEP, jnt_lo[j], jnt_hi[j])
    env.set_joint_qpos(qpos)
    env.mj_forward()

    # 收敛判定
    err = np.linalg.norm(delta)
    if err < ATOL:
        print(f"IK 收敛于迭代 {i + 1}，误差 {err:.4f}m")
        break

# 5. 验证
final = env.get_body_xpos_xmat_xquat([foot_body])[foot_body]["xpos"]
print(f"左脚最终位置: {final}")
print(f"目标位置:     {target}")
print(f"误差: {np.linalg.norm(final - target):.4f}m")
```

### IK 要点

| 参数 | 作用 | 推荐值 |
|------|------|--------|
| `DAMPING` | 阻尼系数 — 越大越稳定但收敛慢 | 0.01–0.1 |
| `STEP` | 每步最大关节变化 — 控制速度 | 0.02–0.1 |
| `ITERS` | 最大迭代次数 | 50–200 |
| `ATOL` | 收敛阈值 | 0.01–0.05 |

### 关节限位 clamp

从 `model.get_joint_dict()` 读取每个关节的 `"Range"` 和 `"Limited"` 字段，
每次 IK 迭代后将关节角 clamp 到限位内，防止生成不可达的姿态。

```python
jdict = env.model.get_joint_dict()
for jn in joint_names:
    lo, hi = jdict[jn]["Range"]       # [lower, upper]
    limited = jdict[jn]["Limited"]    # True/False
```

### 多 body 场景的注意事项

在多 body 场景中（如 G1 + 操纵物体 + 玩具），**不能**直接用 `jacp_foot[:, 7:]` 取 G1 关节列。
必须通过 `jnt_dofadr` 获取各关节在全局 dof 数组中的地址范围 `[v_min, v_max]`，
再从中切片。

---

## 完整工作流：外力 + IK 组合

```python
# 1. 预设姿态（微蹲，给 IK 一个合理的起点）
preset = {
    f"{agent}_left_knee_joint": 0.6,
    f"{agent}_left_hip_pitch_joint": -0.3,
    f"{agent}_left_ankle_pitch_joint": -0.3,
}
qpos = env.data.qpos.copy()
for jn, val in preset.items():
    qpos[env.jnt_qposadr(jn)] = val
env.set_joint_qpos(qpos)
env.mj_forward()

# 2. IK 抬起左脚
# ...（见上方 IK 示例）

# 3. 施加外力推开障碍物
env.apply_body_force("obstacle_box",
                     force=np.array([10.0, 0.0, 0.0]),
                     torque=np.array([0.0, 0.0, 0.0]))
for _ in range(50):
    env.do_simulation(ctrl, env.frame_skip)
env.clear_body_force("obstacle_box")

# 4. Mocap 拖拽物体
env.set_mocap_pos_and_quat({
    "gripper_mocap": {"pos": target_pos, "quat": target_quat}
})
```

---

## 常见问题

### `mj_forward()` 后 body 位姿仍不对

确认 `set_joint_qpos` 传入了**完整**的 qpos 数组（长度 `nq`），不是只传改了的那几个关节。

### IK 不收敛

1. 增大阻尼系数 `DAMPING`（更保守）
2. 检查 jac_leg 的形状（应该用 G1 关节列范围 `[min(dof_adrs), max(dof_adrs)+1]`，不是全量 `[:, :]`）
3. 确认 `mj_forward()` 在每次 `set_joint_qpos` 后都调用了
4. 减小目标位移（一次性移动太大可能超出关节限位）
5. 预设微蹲姿态：从伸直状态出发，纯 DLS 可能走反关节方向

### 雅可比全是零

1. 确认 `mj_jacBody` 接收的是预分配的零数组（原地写入）
2. 确认 body_name 名称正确（包含 agent 前缀）
3. 在线模式下确保已至少步进一次（初始状态 jac 可能为零）

---

## 下一步

掌握了状态控制和 IK，接下来学习如何**让 G1 行走**：[🦿 G1 行走控制](../robot_control/joint-control.md)。
