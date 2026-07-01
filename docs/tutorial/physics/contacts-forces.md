# 💥 接触与力

OrcaGym 提供全面的接触和力查询接口，用于奖励计算、调试和分析。

## 接触检测

### 获取活跃接触

```python
# 获取所有当前接触对（通用）
contacts = env.query_contact_simple()
# → [{"geom1": 12, "geom2": 34, "dist": ..., "pos": ..., "frame": ...}, ...]

print(f"当前有 {len(contacts)} 个接触对")
```

### 获取接触力

```python
# 先拿到接触 ID 列表
contact_ids = list(range(len(contacts)))

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
 
 contact_ids = list(range(len(contacts)))
 forces = env.query_contact_force(contact_ids)
 
 for i, c in enumerate(contacts[:5]): # 显示前 5 个
 fid = i
 f = forces[fid]
 f_linear = f[:3]
 f_magnitude = np.linalg.norm(f_linear)
 print(f" 接触 {i}: geom{c['geom1']} ↔ geom{c['geom2']}, "
 f"力={f_magnitude:.2f}N, 方向={f_linear}")

# 在仿真循环中使用
env.do_simulation(ctrl, n_frames)
analyze_contacts(env)
```

## Body 外部约束力

```python
# 获取每个 body 的外部约束力（通用）
cfrc_ext = env.get_cfrc_ext() # shape: (nbody, 6)
# 每行: [fx, fy, fz, mx, my, mz]

# 找出受力最大的 body
max_force_idx = np.argmax(np.linalg.norm(cfrc_ext[:, :3], axis=1))
print(f"受力最大的 body ID: {max_force_idx}, 力: {cfrc_ext[max_force_idx, :3]}")
```

## 施加外力

### 显式方法（推荐）

```python
# 对 body 直接施加力/力矩
env.apply_body_force("torso_link",
 force=np.array([0., 0., 100.]),
 torque=np.array([0., 0., 0.]),
)

# 清除力
env.clear_body_force("torso_link")
env.clear_all_forces()

# 在 site 点施加力（自动计算力臂）
env.mj_apply_force_at_site(
 site_name="gripper_site",
 force=np.array([0.0, 0.0, 10.0]),
 torque=np.array([0.0, 0.0, 0.0]),
)

# 实现脉冲力（每帧清零上一帧的外力）
env.mj_clear_xfrc_applied_for_site("gripper_site")
env.mj_apply_force_at_site("gripper_site", force=np.array([0, 0, 5]), torque=np.zeros(3))
```

### 

```python
# ：通过 gym 访问
env.gym.mj_apply_force_at_site(
 site_name="gripper_site",
 force=np.array([0.0, 0.0, 10.0]),
 torque=np.array([0.0, 0.0, 0.0]),
)
```

### 外力物理原理

施力在 site 点时，等效到 body 中心：

- 力不变：F_body = F
- 附加扭矩：τ = r × F（r = site_pos - body_pos）
- 总扭矩：τ_total = r × F + τ_user

## 接触力计算的典型应用

### 奖励函数中的接触

```python
def contact_reward(env):
 """奖励适度的接触力"""
 contacts = env.query_contact_simple()
 if not contacts:
 return -1.0 # 没有接触时惩罚
 
 contact_ids = list(range(len(contacts)))
 forces = env.query_contact_force(contact_ids)
 
 total_force = sum(np.linalg.norm(f[:3]) for f in forces.values())
 
 if total_force < 100:
 return 0.5 # 轻度接触
 elif total_force < 500:
 return 1.0 # 理想接触
 else:
 return -0.5 # 过度用力
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
