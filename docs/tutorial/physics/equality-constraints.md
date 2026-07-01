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
from orca_core.orca_gym_local import AnchorType

AnchorType.NONE # 无锚定
AnchorType.WELD # 焊接 —— 完全固定
AnchorType.BALL # 球关节 —— 固定位置，允许旋转
```

### 锚定一个物体（）

```python
# 通过等式约束 + mocap 锚点实现抓取
env.anchor_actor("object_body_name", "weld") # 或 "connect"

# 现在 object_body_name 被焊接到 mocap body
# 移动 mocap body 即可移动物体
```

### 释放物体

```python
env.release_body_anchored()
```

## Mocap 锚点控制

```python
# 设置 mocap 锚点位置（驱动物体移动）
env.set_mocap_pos_and_quat({
 "ActorManipulator_Anchor": {
 "pos": np.array([0.5, 0.0, 0.8], dtype=np.float64),
 "quat": np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float64),
 }
})

# 必须 forward 以更新派生量
env.mj_forward()
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

### 修改约束对象（）

```python
# 修改等式约束的关联对象（按名称，Env 层自动解析为 id）
env.modify_equality_objects(
 eq_ids=[0], # 等式约束索引
 obj1_names=["ActorManipulator_Anchor"], # 新的 obj1 body 名称
 obj2_names=["target_object"], # 新的 obj2 body 名称
)
```

### 停用/重激活约束

```python
# 停用等式约束（解除连接）
env.update_equality_constraints([{
 "type": 0, # 清零类型
 "obj1_id": -1,
 "obj2_id": -1,
 "data": np.zeros(7), # mjNEQDATA
}])
```

### 更新约束参数

```python
# 通过约束列表批量更新
env.update_equality_constraints(eq_list)
```

## 完整操作流程

```python
import numpy as np
from orca_core.orca_gym_local import AnchorType

def grasp_object(env, object_name: str):
 """抓取指定物体（）"""
 # 1. 设置锚定：mocap 移到物体位置 + 建立 weld 约束
 env.anchor_actor(object_name, "weld")
 
 # 2. 移动锚点到目标位置
 env.set_mocap_pos_and_quat({
 "ActorManipulator_Anchor": {
 "pos": np.array([0.5, 0.0, 0.8], dtype=np.float64),
 "quat": np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float64),
 }
 })
 
 # 3. 刷新
 env.mj_forward()
 env._sync_view()

def release_object(env):
 """释放当前锚定的物体"""
 env.release_body_anchored()
 env.mj_forward()
```

## UI 交互中的锚定

当用户在 OrcaStudio UI 中拖拽物体时：

1. UI 自动创建 WELD 约束连接物体和锚点
2. 锚点跟随鼠标移动
3. Python 可通过 `do_body_manipulation()` 自动感知和处理
4. `render()` 中自动调用 `do_body_manipulation()`

```python
# 在 render 后检测 UI 操作（）
# do_body_manipulation() 在 render() 中自动调用
# 也可通过 studio_bridge() 方法访问
bridge = env.studio_bridge()
body_name, anchor_type = bridge.get_body_manipulation_anchored()
if body_name is not None:
 print(f"用户在操作物体: {body_name}, 锚定类型: {anchor_type}")
```
