# 💥 接触与力

OrcaGym 提供全面的接触和力查询接口，用于奖励计算、调试和分析。

## 接触检测

### 获取活跃接触

```python
# 获取所有当前接触对
contacts = env.query_contact_simple()
# → [{"ID": 0, "Geom1": 12, "Geom2": 34, "Body1": 3, "Body2": 7}, ...]

print(f"当前有 {len(contacts)} 个接触对")
```

### 获取接触力

```python
# 先拿到接触 ID 列表
contact_ids = [c["ID"] for c in contacts]

# 获取 6D 接触力 [fx, fy, fz, mx, my, mz]
contact_forces = env.query_contact_force(contact_ids)
# → {0: array([fx, fy, fz, mx, my, mz]), 1: array(...), ...}
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
    
    contact_ids = [c["ID"] for c in contacts]
    forces = env.query_contact_force(contact_ids)
    
    for i, c in enumerate(contacts[:5]):  # 显示前 5 个
        fid = c["ID"]
        f = forces[fid]
        f_linear = f[:3]
        f_magnitude = np.linalg.norm(f_linear)
        print(f"  接触 {fid}: body{c['Body1']} ↔ body{c['Body2']}, "
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

```python
# 在 site 点上施加力和力矩
env.gym.mj_apply_force_at_site(
    site_name="gripper_site",
    force=np.array([0.0, 0.0, 10.0]),    # fx, fy, fz (world frame)
    torque=np.array([0.0, 0.0, 0.0]),    # tx, ty, tz (world frame)
)
```

### 外力物理原理

施力在 site 点时，等效到 body 中心：

- 力不变：F_body = F
- 附加扭矩：τ = r × F（r = site_pos - body_pos）
- 总扭矩：τ_total = r × F + τ_user

```python
# 实现脉冲力（每帧清零上一帧的外力）
env.gym.mj_clear_xfrc_applied_for_site("gripper_site")
env.gym.mj_apply_force_at_site("gripper_site", force=np.array([0, 0, 5]), torque=np.zeros(3))
```

## 接触力计算的典型应用

### 奖励函数中的接触

```python
def contact_reward(env):
    """奖励适度的接触力"""
    contacts = env.query_contact_simple()
    if not contacts:
        return -1.0  # 没有接触时惩罚
    
    contact_ids = [c["ID"] for c in contacts]
    forces = env.query_contact_force(contact_ids)
    
    total_force = sum(np.linalg.norm(f[:3]) for f in forces.values())
    
    if total_force < 100:
        return 0.5  # 轻度接触
    elif total_force < 500:
        return 1.0  # 理想接触
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
        if (c["Body1"] == body_a_id and c["Body2"] == body_b_id) or \
           (c["Body1"] == body_b_id and c["Body2"] == body_a_id):
            return True
    return False
```

## 高级：接触来源统计

```python
# 获取接触来源分布
sources = env.gym.get_contact_sources()
# → {("body_a", "body_b"): contact_count, ...}

# 按接触数排序
sorted_sources = sorted(sources.items(), key=lambda x: x[1], reverse=True)
for (b1, b2), count in sorted_sources:
    print(f"  {b1} ↔ {b2}: {count} contacts")
```
