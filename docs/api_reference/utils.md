# 🔧 Utils API

工具函数和控制器，位于 `orca_gym/utils/`。

## InverseKinematicsController

```python
class InverseKinematicsController:
    def __init__(
        self,
        env: RobomimicEnv,         # 环境对象
        site_id: int,              # 末端执行器 site ID
        dof_indices: list[int],    # 受控关节的 DOF 索引
        lamba_value: float = 1e-3, # 阻尼系数
        alpha_value: float = 0.2,  # 步长缩放
    )
    def set_goal(pos: np.ndarray, quat: np.ndarray)   # 设置目标位姿 (世界坐标系)
    def set_lambda(lambda_value: float)                # 设置阻尼系数
    def set_alpha(alpha_value: float)                  # 设置步长
    def compute_inverse_kinematics() -> np.ndarray     # 计算 dq (nv,)
```

## JointController

PID+速度前馈的单关节力矩控制器。

```python
class JointController:
    def __init__(
        self,
        Kp: float = 10.0,            # 位置比例增益
        Ki: float = 0.1,             # 积分增益
        Kd: float = 2.0,             # 速度微分增益
        Kv: float = 5.0,             # 速度误差增益
        max_speed: float = 80.0,     # 最大允许速度 (弧度/秒)
        ctrlrange: tuple = (-80, 80),# 驱动器力矩范围 (low, high)
    )
    def compute_torque(
        self,
        target_qpos: float,          # 目标角度 (弧度)
        current_qpos: float,         # 当前角度 (弧度)
        current_qvel: float,         # 当前速度 (弧度/秒)
        dt: float,                   # 仿真步长 (秒)
    ) -> float                       # 输出力矩 (Nm)
```

## LowPassFilter

```python
class LowPassFilter:
    def __init__(self, alpha: float, initial_output: np.ndarray)
    def apply(self, x: np.ndarray) -> np.ndarray   # 滤波输出
```

## RewardPrinter

训练过程中的奖励统计与打印。

```python
class RewardPrinter:
    PRINT_DETAIL = True

    def __init__(self, buffer_size: int = 100)
    def print_reward(
        self,
        message: str,             # 奖励项名称
        reward: float = 0,        # 当前步的奖励值
        coeff: float = 1.0,       # 奖励系数
    )
```

## 旋转工具 (`rotations`)

位于 `orca_gym/utils/rotations.py`。所有函数支持 batch 操作，角度单位为弧度。

```python
from orca_gym.utils import rotations

rotations.mat2quat(mat)         # 3x3 矩阵 → [w,x,y,z]
rotations.quat2mat(quat)        # [w,x,y,z] → 3x3 矩阵
rotations.quat_mul(q1, q2)      # 四元数乘法
rotations.quat_conjugate(q)     # 四元数共轭
rotations.quat2euler(quat)      # 四元数 → 欧拉角
rotations.euler2quat(euler)     # 欧拉角 → 四元数
rotations.euler2mat(euler)      # 欧拉角 → 旋转矩阵
rotations.mat2euler(mat)        # 旋转矩阵 → 欧拉角
rotations.quat_slerp(q0, q1, fraction)  # 四元数球面线性插值
rotations.quat_rot_vec(q, v)    # 用四元数旋转向量
rotations.quat2axisangle(quat)  # 四元数 → 轴角
rotations.normalize_angles(a)   # 角度归一化到 [-pi, pi]
```

## 控制工具函数

```python
from orca_gym.utils.joint_controller import pd_control

# PD 控制：根据位置/速度误差计算力矩
pd_control(target_q, q, kp, target_dq, dq, kd) -> np.ndarray
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
