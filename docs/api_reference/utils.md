# 🔧 Utils API

工具函数和控制器，位于 `orca_gym/utils/`。

## InverseKinematicsController

```python
class InverseKinematicsController:
    def __init__(env, site_id, dof_indices, lamba_value=1e-3, alpha_value=0.2)
    def set_goal(pos, quat)                          # 设置目标位姿
    def set_lambda(lambda_value)                     # 设置阻尼
    def set_alpha(alpha_value)                       # 设置步长
    def compute_inverse_kinematics() -> np.ndarray    # 计算 dq (nv,)
```

## JointController

```python
class JointController:
    def __init__(env, joint_names, kp, kd)
    def compute(target_positions: dict) -> np.ndarray  # 计算 ctrl (nu,)
```

## LowPassFilter

```python
class LowPassFilter:
    def __init__(alpha, shape)
    def apply(x) -> np.ndarray                       # 滤波输出
```

## RewardPrinter

```python
class RewardPrinter:
    def __init__(...)
    # 打印训练过程中的奖励统计
```

## 旋转工具 (`rotations`)

```python
from orca_gym.utils import rotations

rotations.mat2quat(mat)      # 3x3 矩阵 → [w,x,y,z]
rotations.quat2mat(quat)     # [w,x,y,z] → 3x3 矩阵
rotations.quat_mul(q1, q2)   # 四元数乘法
rotations.quat2euler(quat)   # 四元数 → 欧拉角
rotations.euler2quat(euler)  # 欧拉角 → 四元数
```

## 目录工具 (`dir_utils`)

```python
from orca_gym.utils import dir_utils

dir_utils.cleanup_zombie_locks(dir)  # 清理僵尸锁文件
dir_utils.file_lock(path)            # 异步文件锁上下文管理器
```

## MuJoCo 工具 (`mujoco_utils`)

MuJoCo 相关的实用函数。

```python
from orca_gym.utils import mujoco_utils
```
