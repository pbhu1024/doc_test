# 🦾 逆运动学

OrcaGym 内置了基于雅可比伪逆的逆运动学（IK）控制器。

## InverseKinematicsController

```python
from orca_utils.inverse_kinematics_controller import InverseKinematicsController

# 创建 IK 控制器
ik = InverseKinematicsController(
 env=env,
 site_id=env.model.site_name2id("end_effector"),
 dof_indices=[0, 1, 2, 3, 4, 5], # 要控制的关节 DOF 索引
 lamba_value=1e-3, # 阻尼因子（数值稳定性）
 alpha_value=0.2, # 步长因子
)

# 设置目标
ik.set_goal(
 pos=np.array([0.5, 0.0, 0.3]), # 目标位置
 quat=np.array([1.0, 0.0, 0.0, 0.0]) # 目标姿态 [w, x, y, z]
)

# 计算 IK 解（增量）
dq = ik.compute_inverse_kinematics() # (nv,) 关节速度
```

## 工作原理

```
目标位姿 (pos, quat)
 │
 ▼
 误差计算: e = [pos_err | rot_err] (6D)
 │
 ▼
 雅可比: J = [J_pos; J_rot] (6 × nv)
 │
 ▼
 阻尼伪逆: J⁺ = J.T @ (J @ J.T + λ²I)^(-1)
 │
 ▼
 Δq = α · J⁺ @ e (nv,)
```

## 参数调优

| 参数 | 作用 | 典型值 |
|------|------|--------|
| `lamba_value` | 阻尼 → 数值稳定性 | 1e-4 ~ 1e-2 |
| `alpha_value` | 步长 → 收敛速度 | 0.1 ~ 0.5 |

- λ 太小 → 数值不稳定，关节可能剧烈抖动
- λ 太大 → 收敛慢，tracking 精度差
- α 太小 → 收敛慢
- α 太大 → 可能超调或抖动

## 完整 IK 控制示例

```python
import numpy as np
from orca_utils.inverse_kinematics_controller import InverseKinematicsController

class IKTaskEnv(OrcaGymLocalEnv):
 def __init__(self, ...):
 super().__init__(...)
 
 ee_site_id = self.model.site_name2id("ee_site")
 dof_indices = list(range(6)) # 假设前 6 个 DOF 是机械臂
 
 self.ik = InverseKinematicsController(
 env=self,
 site_id=ee_site_id,
 dof_indices=dof_indices,
 )
 
 def move_to_target(self, target_pos, target_quat):
 """使用 IK 将末端移动到目标"""
 self.ik.set_goal(target_pos, target_quat)
 
 for _ in range(100): # 最多 100 步
 dq = self.ik.compute_inverse_kinematics()
 
 if np.linalg.norm(dq) < 1e-3:
 break # 已收敛
 
 # 应用控制
 ctrl = np.zeros(self.model.nu)
 ctrl[self.ik.dof_indices] = dq
 
 self.do_simulation(ctrl, self.frame_skip)
 self.render()
```

## 注意事项

- IK 控制器依赖 `RobomimicEnv` 环境抽象
- 需要知道末端 site 名称和可控 DOF 索引
- 雅可比计算依赖 MuJoCo 的 `mj_jacSite`
- 考虑关节限位——IK 解可能超出范围
- 奇点附近的雅可比条件数会很大
