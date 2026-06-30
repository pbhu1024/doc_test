# 🔗 等式约束

MuJoCo 的等式约束是 OrcaGym 中实现物体抓取和操作的核心机制。

## 什么是等式约束

等式约束强制两个 body 之间满足某种运动学关系：

| 约束类型 | 效果 | 自由度 |
|----------|------|--------|
| `mjEQ_WELD` | 完全固定（位置 + 姿态） | 0 DOF |
| `mjEQ_CONNECT` (BALL) | 固定位置，允许旋转 | 3 DOF (旋转) |

## 锚定操作

### 锚定类型

```python
from orca_gym.core.orca_gym_local import AnchorType

AnchorType.NONE  # 无锚定
AnchorType.WELD  # 焊接 —— 完全固定
AnchorType.BALL  # 球关节 —— 固定位置，允许旋转
```

### 锚定一个物体

```python
# 通过等式约束 + mocap 锚点实现抓取
env.anchor_actor("object_body_name", AnchorType.WELD)

# 现在 object_body_name 被焊接到锚点 body
# 移动锚点即可移动物体
```

### 释放物体

```python
env.release_body_anchored()
```

## Mocap 锚点控制

```python
# 设置 mocap 锚点位置（驱动物体移动）
env.set_mocap_pos_and_quat({
    env._anchor_body_name: {
        "pos": np.array([0.5, 0.0, 0.8], dtype=np.float64),
        "quat": np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float64),
    }
})

# 必须 forward 以更新派生量
env.mj_forward()
env.update_data()
```

## 等式约束管理

### 获取约束信息

```python
# 模型中所有等式约束的列表
eq_list = env.model.get_eq_list()
for eq in eq_list:
    print(f"Type: {eq['eq_type']}, "
          f"Obj1: {eq['obj1_id']}, "
          f"Obj2: {eq['obj2_id']}, "
          f"Active: {eq['active']}")
```

### 修改约束对象

```python
# 修改等式约束中的两个对象
env.gym.modify_equality_objects(
    old_obj1_id=anchor_id,
    old_obj2_id=dummy_id,
    new_obj1_id=anchor_id,
    new_obj2_id=target_object_id,
)
```

### 更新约束参数

```python
# 通过约束列表批量更新
env.update_equality_constraints(eq_list)
```

## 完整操作流程

```python
import numpy as np
from orca_gym.core.orca_gym_local import AnchorType

def grasp_object(env, object_name: str):
    """抓取指定物体"""
    # 1. 设置锚定类型（WELD = 完全固定）
    env.anchor_actor(object_name, AnchorType.WELD)
    
    # 2. 移动锚点到目标位置
    env.set_mocap_pos_and_quat({
        env._anchor_body_name: {
            "pos": np.array([0.5, 0.0, 0.8], dtype=np.float64),
            "quat": np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float64),
        }
    })
    
    # 3. 刷新
    env.mj_forward()
    env.update_data()

def release_object(env):
    """释放当前锚定的物体"""
    env.release_body_anchored()
    env.mj_forward()
    env.update_data()
```

## UI 交互中的锚定

当用户在 OrcaStudio UI 中拖拽物体时：

1. UI 自动创建 WELD 约束连接物体和锚点
2. 锚点跟随鼠标移动
3. Python 可通过 `get_body_manipulation_anchored()` 感知
4. 可通过 `get_body_manipulation_movement()` 获取位移增量

```python
# 在 render 后检测 UI 操作
body_name, anchor_type = env.get_body_manipulation_anchored()
if body_name is not None:
    print(f"用户在操作物体: {body_name}, 锚定类型: {anchor_type}")
```
