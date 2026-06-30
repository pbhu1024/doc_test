# 🔧 Utils API

工具函数和控制器，位于 `orca_gym/utils/`。提供逆运动学、关节控制、旋转转换、低通滤波等实用工具。

## 类与函数概览

| 名称 | 文件 | 说明 |
|------|------|------|
| `InverseKinematicsController` | `inverse_kinematics_controller.py` | 基于雅可比的逆运动学求解器 |
| `JointController` | `joint_controller.py` | PID+速度前馈的关节力矩控制器 |
| `pd_control` | `joint_controller.py` | 简单 PD 控制器函数 |
| `LowPassFilter` | `low_pass_filter.py` | 一阶低通滤波器 |
| `RewardPrinter` | `reward_printer.py` | 训练奖励统计与打印 |
| `rotations` | `rotations.py` | 旋转表示转换工具集 |
| `dir_utils` | `dir_utils.py` | 目录与文件锁工具 |
| `mujoco_utils` | `mujoco_utils.py` | MuJoCo 辅助工具 |

---

## InverseKinematicsController

位于 `orca_gym/utils/inverse_kinematics_controller.py`。基于雅可比矩阵 + 阻尼最小二乘法的逆运动学求解器。

### 构造

```python
class InverseKinematicsController:
    def __init__(
        self,
        env: RobomimicEnv,          # 环境对象
        site_id: int,               # 末端执行器 site 的 ID
        dof_indices: list[int],     # 受控关节的 DOF 索引列表
        lamba_value: float = 1e-3,  # 阻尼系数（λ² 的根）
        alpha_value: float = 0.2,   # 步长缩放系数
    )
```

### 目标设置

```python
def set_goal(pos: np.ndarray, quat: np.ndarray)
```
设置目标末端执行器位姿（世界坐标系）。`pos`: `[x, y, z]`，`quat`: `[w, x, y, z]`。

### 参数调整

```python
def set_lambda(lambda_value: float)
```
设置阻尼系数。值越大解越平滑但收敛越慢；值越小收敛越快但可能不稳定。

```python
def set_alpha(alpha_value: float)
```
设置步长缩放系数。范围 (0, 1]，推荐 0.1-0.3。

### 求解

```python
def compute_inverse_kinematics() -> np.ndarray
```
计算并返回增量关节角度 `dq`，形状 `(nv,)`。

算法流程：
1. 从 site 获取当前末端执行器位姿
2. 计算位置误差 + 旋转误差（rotvec）
3. 误差小于 1e-3 时返回零向量
4. 计算 site 雅可比（位置 + 旋转），提取受控 dof 子矩阵
5. 阻尼最小二乘求解：`dq = J^T (J×J^T + λ²I)^{-1} e`
6. 缩放 dq 到全局 nv 维空间，乘以 alpha

### 使用示例

```python
from orca_gym.utils.inverse_kinematics_controller import InverseKinematicsController
import numpy as np

ik = InverseKinematicsController(
    env=my_env,
    site_id=end_effector_site_id,
    dof_indices=arm_dof_indices,  # 如 [0, 1, 2, 3, 4, 5]
    lamba_value=1e-3,
    alpha_value=0.2,
)

# 设置目标位姿（世界坐标系）
ik.set_goal(
    pos=np.array([0.5, 0.0, 0.3]),       # [x, y, z]
    quat=np.array([1.0, 0.0, 0.0, 0.0]),  # [w, x, y, z]
)

# 每步计算逆运动学
dq = ik.compute_inverse_kinematics()
current_qpos += dq  # 沿 dq 方向更新位置

# 调整参数以获得更快收敛
ik.set_alpha(0.3)
ik.set_lambda(5e-4)
```

---

## JointController

位于 `orca_gym/utils/joint_controller.py`。带积分抗饱和的 PID + 速度前馈单关节力矩控制器。

### 构造

```python
class JointController:
    def __init__(
        self,
        Kp: float = 10.0,            # 位置比例增益
        Ki: float = 0.1,             # 积分增益
        Kd: float = 2.0,             # 速度微分增益
        Kv: float = 5.0,             # 速度误差反馈增益
        max_speed: float = 80.0,     # 最大允许目标速度 (rad/s)
        ctrlrange: tuple = (-80, 80),# 驱动器力矩范围 (min, max) Nm
    )
```

### 计算力矩

```python
def compute_torque(
    self,
    target_qpos: float,        # 目标角度 (rad)
    current_qpos: float,       # 当前角度 (rad)
    current_qvel: float,       # 当前速度 (rad/s)
    dt: float,                 # 仿真步长 (s)
) -> float                    # 输出力矩 (Nm)
```

### 控制逻辑

1. **比例速度规划**: 根据位置误差生成目标速度 `target_vel = Kv × error_pos`
2. **速度限制**: clamp target_vel 到 `[-max_speed, max_speed]`
3. **PID 计算**:
   - P 项: `Kp × error_pos`
   - I 项: `Ki × Σ error_pos × dt`（带积分饱和限制 ±100）
   - D 项: `Kd × (error_pos - prev_error_pos) / dt`
   - 速度误差项: `Kv × (target_vel - current_qvel)`
4. **输出限制**: clamp 到 `[ctrl_low, ctrl_high]`

### 使用示例

```python
from orca_gym.utils.joint_controller import JointController

controller = JointController(
    Kp=50.0,
    Ki=0.5,
    Kd=3.0,
    Kv=8.0,
    max_speed=100.0,
    ctrlrange=(-100, 100),
)

dt = 0.001  # 仿真步长

# 每步计算扭矩
for target in target_trajectory:
    torque = controller.compute_torque(
        target_qpos=target,
        current_qpos=current_angle,
        current_qvel=current_velocity,
        dt=dt,
    )
    # 将扭矩施加到执行器
    ctrl[actuator_id] = torque
```

---

## pd_control

位于 `orca_gym/utils/joint_controller.py`。简单 PD 控制器函数。

```python
def pd_control(
    target_q: np.ndarray,      # 目标位置
    q: np.ndarray,             # 当前位置
    kp: float | np.ndarray,    # 位置增益
    target_dq: np.ndarray,     # 目标速度
    dq: np.ndarray,            # 当前速度
    kd: float | np.ndarray,    # 速度增益
) -> np.ndarray               # 输出力矩
```

计算公式: `torque = (target_q - q) × kp + (target_dq - dq) × kd`

---

## LowPassFilter

位于 `orca_gym/utils/low_pass_filter.py`。一阶指数平滑低通滤波器。

```python
class LowPassFilter:
    def __init__(self, alpha: float, initial_output: np.ndarray)
    def apply(self, x: np.ndarray) -> np.ndarray
```

公式: `output[t] = alpha × x[t] + (1 - alpha) × output[t-1]`

- `alpha`: 平滑系数 (0, 1]，1 = 不过滤，接近 0 = 强滤波
- `initial_output`: 初始输出值（需与输入形状一致）

---

## RewardPrinter

位于 `orca_gym/utils/reward_printer.py`。训练过程中的奖励统计与打印工具。

```python
class RewardPrinter:
    PRINT_DETAIL = True  # 控制是否打印详细信息

    def __init__(self, buffer_size: int = 100)

    def print_reward(
        self,
        message: str,          # 奖励项名称
        reward: float = 0,     # 当前步的奖励值
        coeff: float = 1.0,    # 奖励系数
    )
```
每次调用 `print_reward` 会累积该奖励项的值。当累积数量达到 buffer_size 时自动打印统计信息（平均值等）。

---

## 旋转工具 (`rotations`)

位于 `orca_gym/utils/rotations.py`。所有函数支持 **batch 操作**，角度单位为 **弧度**。

### 约定

- **四元数格式**: `[w, x, y, z]`（MuJoCo 标准）
- **欧拉角顺序**: `'xyz'` 相对旋转轴（MuJoCo 默认）
- **矩阵格式**: 3×3 旋转矩阵（LR 约定）

### 转换函数

```python
from orca_gym.utils import rotations
```

| 函数 | 说明 |
|------|------|
| `mat2quat(mat)` | 3×3 矩阵 → `[w, x, y, z]` |
| `quat2mat(quat)` | `[w, x, y, z]` → 3×3 矩阵 |
| `euler2mat(euler)` | 欧拉角 → 3×3 矩阵 |
| `mat2euler(mat)` | 3×3 矩阵 → 欧拉角 |
| `euler2quat(euler)` | 欧拉角 → `[w, x, y, z]` |
| `quat2euler(quat)` | `[w, x, y, z]` → 欧拉角（通过 mat 中转） |
| `quat2axisangle(quat)` | 四元数 → `(axis, theta)` 轴角表示 |

### 四元数运算

```python
rotations.quat_mul(q1, q2)              # 四元数乘法 q1 * q2
rotations.quat_conjugate(q)             # 四元数共轭
rotations.quat_identity()               # 单位四元数 [1, 0, 0, 0]
rotations.quat_slerp(q0, q1, fraction)  # 球面线性插值
rotations.quat_rot_vec(q, v)            # 用四元数旋转向量 v
```

### 角度处理

```python
rotations.normalize_angles(angles)               # 归一化到 [-π, π]
rotations.subtract_euler(e1, e2)                 # 欧拉角差值（正确处理旋转环绕）
rotations.round_to_straight_angles(angles)       # 舍入到最近的 90° 倍数
```

### 高级转换

```python
rotations.euler2point_euler(euler)       # 欧拉角 → [sin, cos] 六维表示
rotations.point_euler2euler(point_euler)  # [sin, cos] 六维 → 欧拉角
rotations.quat2point_quat(quat)          # 四元数 → 五维参数化
rotations.point_quat2quat(point_quat)    # 五维参数化 → 四元数
rotations.get_parallel_rotations()       # 所有 90° 倍数的规范旋转（24 种）
```

### 使用示例

```python
from orca_gym.utils import rotations
import numpy as np

# 四元数 → 矩阵
mat = rotations.quat2mat(np.array([1.0, 0.0, 0.0, 0.0]))  # 单位旋转

# 欧拉角 → 四元数
quat = rotations.euler2quat(np.array([0.0, np.pi/2, 0.0]))  # 绕y轴转90°

# 球面插值
q0 = np.array([1.0, 0.0, 0.0, 0.0])
q1 = rotations.euler2quat(np.array([np.pi/2, 0.0, 0.0]))
q_mid = rotations.quat_slerp(q0, q1, 0.5)  # 中间姿态

# 用四元数旋转向量
v = np.array([1.0, 0.0, 0.0])
v_rot = rotations.quat_rot_vec(quat, v)

# Batch 操作
eulers = np.array([[0.0, 0.5, 0.0], [np.pi/4, 0.0, 0.0], [0.0, 0.0, -np.pi/2]])
quats = rotations.euler2quat(eulers)  # 返回 (3, 4) 数组
```

---

## 目录工具 (`dir_utils`)

位于 `orca_gym/utils/dir_utils.py`。

```python
from orca_gym.utils.dir_utils import cleanup_zombie_locks, file_lock
```

```python
def cleanup_zombie_locks(dir: str)
```
清理指定目录中的僵尸锁文件。在 `OrcaGymLocal.__init__` 中自动调用，清理 temp 目录。

```python
async def file_lock(path: str, timeout: float = 30.0) -> AsyncContextManager
```
异步文件锁上下文管理器。使用文件系统上的锁文件实现，超时时间默认 30 秒。

使用示例:

```python
from orca_gym.utils.dir_utils import file_lock

async with file_lock("/tmp/my_resource.dat", timeout=10.0):
    # 在此块内安全地读写共享资源
    pass
```

---

## MuJoCo 工具 (`mujoco_utils`)

位于 `orca_gym/utils/mujoco_utils.py`。MuJoCo 相关的实用函数集。提供对 `mujoco_py_utils.py` 和 `mujoco_utils.py` 的封装。

```python
from orca_gym.utils import mujoco_utils
```

包含 MuJoCo 模型解析、状态提取等辅助函数。
