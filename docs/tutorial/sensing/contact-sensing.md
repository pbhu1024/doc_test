# 🤝 接触感知

利用接触力信息作为机器人的"触觉感知"。

## 接触作为触觉信号

接触力可以提供丰富的信息：

- **抓取检测** — 是否有接触
- **力控** — 维持目标接触力
- **表面识别** — 接触法向方向
- **碰撞检测** — 意外碰撞

## 接触查询流水线

```python
# 1. 获取所有活跃接触
contacts = env.query_contact_simple()

# 2. 筛选感兴趣的接触
target_body_id = env.model.body_name2id("robot_finger")
finger_contacts = [
    c for c in contacts 
    if env.model.get_geom_body_id(c["Geom1"]) == target_body_id 
    or env.model.get_geom_body_id(c["Geom2"]) == target_body_id
]

# 3. 获取接触力
if finger_contacts:
    contact_ids = [c["ID"] for c in finger_contacts]
    forces = env.query_contact_force(contact_ids)
```

## 抓取检测

```python
def is_grasped(env, finger_names: list[str], object_name: str) -> bool:
    """检查手指是否与目标物体有接触"""
    contacts = env.query_contact_simple()
    object_id = env.model.body_name2id(object_name)
    finger_ids = [env.model.body_name2id(f) for f in finger_names]
    
    for c in contacts:
        geom1_body = env.model.get_geom_body_id(c["Geom1"])
        geom2_body = env.model.get_geom_body_id(c["Geom2"])
        bodies = {geom1_body, geom2_body}
        if object_id in bodies and any(f in bodies for f in finger_ids):
            return True
    return False
```

## 力控

```python
def force_control(env, target_force: float = 10.0):
    """简单的力控：维持目标接触力"""
    contacts = env.query_contact_simple()
    contact_ids = [c["ID"] for c in contacts]
    
    if not contact_ids:
        return np.zeros(env.model.nu)  # 没有接触
    
    forces = env.query_contact_force(contact_ids)
    total_force = sum(np.linalg.norm(f[:3]) for f in forces.values())
    
    # PID 力控
    force_error = target_force - total_force
    correction = force_error * 0.01
    
    ctrl = np.zeros(env.model.nu)
    # ... 将 correction 分配到相应执行器
    return ctrl
```

## 接触信息汇总

```python
def contact_summary(env) -> dict:
    """生成接触摘要"""
    contacts = env.query_contact_simple()
    
    summary = {
        "total_contacts": len(contacts),
        "body_pairs": set(),
        "total_force": 0.0,
        "max_force": 0.0,
    }
    
    if contacts:
        contact_ids = [c["ID"] for c in contacts]
        forces = env.query_contact_force(contact_ids)
        
        for c in contacts:
            fid = c["ID"]
            f = forces[fid][:3]  # 线力部分
            magnitude = np.linalg.norm(f)
            
            summary["total_force"] += magnitude
            summary["max_force"] = max(summary["max_force"], magnitude)
            summary["body_pairs"].add((env.model.get_geom_body_id(c["Geom1"]), env.model.get_geom_body_id(c["Geom2"])))
    
    return summary
```
