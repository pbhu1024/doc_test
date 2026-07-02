# 💥 接触与力

OrcaGym 提供全面的接触和力查询接口，用于奖励计算、调试和分析。

> 完整可运行代码见 [OrcaPlayground examples/euler/05_force_apply/](https://github.com/OrcaGym/OrcaPlayground)。

## 接触检测

### 获取活跃接触

```python
# 获取所有当前接触对
contacts = env.query_contact_simple()
# → [{"geom1": 12, "geom2": 34, "dist": ..., "pos": ..., "frame": ...}, ...]

print(f"当前有 {len(contacts)} 个接触对")
```

> **注意**：`query_contact_simple()` 返回的字典中 key 为小写 `"geom1"` / `"geom2"`，
> 不是大写 `"Geom1"` / `"Geom2"`。

### 获取接触力

```python
# 先拿到接触 ID 列表（按接触列表索引）
contact_ids = list(range(len(contacts)))

# 获取接触力（返回 6D 力，接触坐标系下）
contact_forces = env.query_contact_force(contact_ids)
# → {0: array([normal, shear1, shear2, torque1, torque2, torque3]), 1: array(...), ...}

# 接触坐标系：第 0 分量为法向力
max_normal = max(abs(f[0]) for f in contact_forces.values())
print(f"最大法向力: {max_normal:.1f}N")
```

## 接触力分析示例

```python
def analyze_contacts(env):
    """分析当前接触状态"""
    contacts = env.query_contact_simple()

    if not contacts:
        print("没有接触")
        return

    print(f"活跃接触数: {len(contacts)}")

    contact_ids = list(range(len(contacts)))
    forces = env.query_contact_force(contact_ids)

    for i, c in enumerate(contacts[:5]):  # 显示前 5 个
        f = forces[i]
        f_linear = f[:3]
        f_magnitude = np.linalg.norm(f_linear)
        print(f"  接触 {i}: geom{c['geom1']} ↔ geom{c['geom2']}, "
              f"力={f_magnitude:.2f}N, 方向={f_linear}")

# 在仿真循环中使用
env.do_simulation(ctrl, n_frames)
analyze_contacts(env)
```

## Body 外部约束力

```python
# 获取每个 body 的外部约束力
cfrc_ext = env.get_cfrc_ext()  # shape: (nbody, 6)
# 每行: [fx, fy, fz, mx, my, mz]

# 找出受力最大的 body
max_force_idx = np.argmax(np.linalg.norm(cfrc_ext[:, :3], axis=1))
print(f"受力最大的 body ID: {max_force_idx}, 力: {cfrc_ext[max_force_idx, :3]}")
```

## 施加外力

### `apply_body_force` — 对 body 直接施力（推荐）

```python
# 对 pelvis 施加 500N 向上的力（世界坐标系）
env.apply_body_force(
    "g1_pelvis",                           # body 名称
    force=np.array([0.0, 0.0, 500.0]),     # 力 (N)，世界坐标系
    torque=np.array([0.0, 0.0, 0.0]),      # 力矩 (N·m)
)
```

施加的力可以通过 `env.data.xfrc_applied` 读取验证：

```python
body_id = env.model.body_name2id("g1_pelvis")
xfrc = env.data.xfrc_applied[body_id, :3]
print(f"施加的外力: {xfrc}")  # 应非零（如 [0, 0, 500]）
```

### 清除外力

```python
# 清除单个 body 的外力
env.clear_body_force("g1_pelvis")

# 验证清力：xfrc_applied 归零
xfrc = env.data.xfrc_applied[body_id, :3]
assert np.all(xfrc == 0)

# 清除所有外力
env.clear_all_forces()
assert np.all(env.data.xfrc_applied == 0)
```

### `mj_apply_force_at_site` — 在 site 点施力

```python
# 在 site 点施加力（自动计算力臂，等效扭矩作用于 body 中心）
env.mj_apply_force_at_site(
    site_name="gripper_site",
    force=np.array([0.0, 0.0, 10.0]),
    torque=np.array([0.0, 0.0, 0.0]),
)

# 实现脉冲力（每帧清零上一帧的外力再施加）
env.mj_clear_xfrc_applied_for_site("gripper_site")
env.mj_apply_force_at_site(
    "gripper_site",
    force=np.array([0, 0, 5]),
    torque=np.zeros(3),
)
```

### 外力物理原理

施力在 site 点时，等效到 body 中心：

- 力不变：F_body = F
- 附加扭矩：τ = r × F（r = site_pos - body_pos）
- 总扭矩：τ_total = r × F + τ_user

### 完整示例：施力抬起机器人

```python
# 1. 记录初始高度
pelvis = env.get_body_xpos_xmat_xquat(["g1_pelvis"])
z_before = float(pelvis["g1_pelvis"]["xpos"][2])

# 2. 施加向上力
env.apply_body_force(
    "g1_pelvis",
    force=np.array([0.0, 0.0, 500.0]),
    torque=np.array([0.0, 0.0, 0.0]),
)

# 3. 步进仿真，让力生效（20 控制周期 = 0.4s）
for _ in range(20):
    env.do_simulation(ctrl, env.frame_skip)

# 4. 验证 pelvis 上升
pelvis = env.get_body_xpos_xmat_xquat(["g1_pelvis"])
z_after = float(pelvis["g1_pelvis"]["xpos"][2])
print(f"pelvis 高度变化: {z_before:.3f} → {z_after:.3f} (Δ={z_after - z_before:.3f}m)")

# 5. 清除外力
env.clear_body_force("g1_pelvis")
```

## 接触力计算的典型应用

### 奖励函数中的接触

```python
def contact_reward(env):
    """奖励适度的接触力"""
    contacts = env.query_contact_simple()
    if not contacts:
        return -1.0  # 没有接触时惩罚

    contact_ids = list(range(len(contacts)))
    forces = env.query_contact_force(contact_ids)

    total_force = sum(np.linalg.norm(f[:3]) for f in forces.values())

    if total_force < 100:
        return 0.5   # 轻度接触
    elif total_force < 500:
        return 1.0   # 理想接触
    else:
        return -0.5  # 过度用力
```

### 碰撞检测

```python
def detect_collision(env, body_a_name, body_b_name):
    """检查两个 body 之间是否发生碰撞"""
    contacts = env.query_contact_simple()
    body_a_id = env.model.body_name2id(body_a_name)
    body_b_id = env.model.body_name2id(body_b_name)

    for c in contacts:
        geom1_body = env.model.get_geom_body_id(c["geom1"])
        geom2_body = env.model.get_geom_body_id(c["geom2"])
        if (geom1_body == body_a_id and geom2_body == body_b_id) or \
           (geom1_body == body_b_id and geom2_body == body_a_id):
            return True
    return False
```

### 站立检测（法向力验证）

```python
def is_standing(env, min_normal_force: float = 50.0) -> bool:
    """检查机器人是否站立（足部接触力是否足够）"""
    contacts = env.query_contact_simple()
    if not contacts:
        return False
    contact_ids = list(range(len(contacts)))
    forces = env.query_contact_force(contact_ids)
    # 第 0 分量是法向力，站立时显著为正
    max_normal = max(abs(f[0]) for f in forces.values())
    return max_normal > min_normal_force
```
