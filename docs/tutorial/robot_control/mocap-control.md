# 🎭 Mocap 控制

Mocap (Motion Capture) body 是 MuJoCo 中的特殊 body，可以通过直接设置位姿来操控。

## 什么是 Mocap Body

- MuJoCo 中 `body_mocapid != -1` 的 body
- 可以**直接设置位姿**而不受力/动力学影响
- 常配合等式约束 (WELD/CONNECT) 实现抓取/拖拽
- 典型用途：锚点、虚拟手、工具附着点

## 查找 Mocap Body

```python
# 查看模型中所有 mocap body
mocap_dict = env.model.get_mocap_dict()
for name, mocap_id in mocap_dict.items():
    print(f"Mocap: {name} (id={mocap_id})")
```

## 设置 Mocap 位姿

```python
# 直接设置 mocap body 的世界坐标位姿
env.set_mocap_pos_and_quat({
    "ActorManipulator_Anchor": {
        "pos": np.array([0.5, 0.0, 0.8], dtype=np.float64),
        "quat": np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float64),
    }
})

# 必须 forward
env.mj_forward()
env.update_data()
```

## Mocap + 等式约束 = 物体操作

```python
# 1. 找到目标物体和锚点
target_body_id = env.model.body_name2id("target_object")
anchor_body_id = env.model.body_name2id("ActorManipulator_Anchor")

# 2. 修改等式约束连接两者
env.gym.modify_equality_objects(
    old_obj1_id=anchor_body_id,
    old_obj2_id=dummy_body_id,
    new_obj1_id=anchor_body_id,
    new_obj2_id=target_body_id,
)

# 3. 更新约束
eq_list = env.model.get_eq_list()
env.gym.update_equality_constraints(eq_list)

# 4. 移动锚点 → 物体跟随
env.set_mocap_pos_and_quat({
    "ActorManipulator_Anchor": {
        "pos": new_target_pos,
        "quat": new_target_quat,
    }
})

env.mj_forward()
env.update_data()
```

## 轨迹跟踪示例

```python
def follow_trajectory(env, trajectory: list[np.ndarray], duration: float):
    """让锚点跟随一条轨迹"""
    steps = int(duration / env.dt)
    
    for i in range(steps):
        t = i / steps
        idx = min(int(t * len(trajectory)), len(trajectory) - 1)
        target_pos = trajectory[idx]
        
        env.set_mocap_pos_and_quat({
            env._anchor_body_name: {
                "pos": target_pos,
                "quat": np.array([1, 0, 0, 0]),
            }
        })
        
        env.mj_forward()
        env.update_data()
        env.render()
```
