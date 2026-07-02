# 🦾 逆运动学（IK）

逆运动学（Inverse Kinematics）将末端执行器的目标位姿转换为关节角度。OrcaGym 提供
基于**阻尼最小二乘（Damped Least Squares）**的 IK 实现。

> 完整可运行代码见 [OrcaPlayground examples/euler/06_jacobian/](https://github.com/OrcaGym/OrcaPlayground)。

---

## 什么是 IK？

```
正运动学 (FK): 关节角度 → 末端位姿（唯一）
逆运动学 (IK): 末端位姿 → 关节角度（可能有多个解或无解）
```

IK 的核心挑战：
- **冗余**：末端位姿只有 6 DOF，但关节可能更多
- **奇点**：某些姿态下雅可比矩阵退化，微小末端位移需要无限大关节速度
- **关节限位**：解必须满足物理限位

---

## 阻尼最小二乘 IK

### 原理

传统雅可比伪逆在奇点附近会产生巨大的关节速度。阻尼最小二乘法通过引入阻尼系数 λ 解决：

```
dq = J^T (J J^T + λ²I)^(-1) Δx
```

- λ = 0：退化为标准伪逆（奇点处不稳定）
- λ 大：解更平滑但收敛慢
- λ 小：收敛快但在奇点附近可能不稳定

### 工作流程

```
目标位姿 (target_xpos)
 │
 ▼
误差计算: Δx = target_xpos - current_xpos
 │
 ▼
雅可比: J = mj_jacBody(jacp, jacr, foot_body)
 │
 ▼
取 G1 关节列: jac_leg = jacp[:, g1_dof_min:g1_dof_max+1]
 │
 ▼
阻尼最小二乘: dq = J^T (J J^T + λ²I)^(-1) Δx
 │
 ▼
限位 clamp: q ← clip(q + dq·step, jnt_lo, jnt_hi)
 │
 ▼
写入: set_joint_qpos(qpos) + mj_forward()
 │
 ▼
收敛判定: ||Δx|| < ATOL?
```

---

## 完整 IK 实现

```python
import numpy as np

# IK 参数
DAMPING = 0.05      # 阻尼系数（越大越稳定，越小收敛越快）
STEP = 0.05         # 每步最大关节变化
ITERS = 80          # 最大迭代次数
ATOL = 0.02         # 收敛阈值（m）

def damped_least_squares_ik(env, foot_body: str, target_offset: np.ndarray):
    """阻尼最小二乘 IK：将 foot_body 移动到 target_offset 指定的偏移位置。
    
    包含两阶段：
    1. 预设微蹲姿态（避免从伸直状态走反关节路径）
    2. IK 迭代抬脚（阻尼最小二乘 + 关节限位 clamp）
    
    Args:
        env: OrcaGymEulerEnv 实例
        foot_body: 要移动的 body 完整名称（如 "g1_left_ankle_roll_link"）
        target_offset: 目标偏移量 [dx, dy, dz]（世界坐标系）
    """
    agent = env.agent_name
    
    # -- 获取 G1 关节信息 --
    G1_ROT_JOINT_SUFFIXES = [
        "left_hip_pitch_joint", "left_hip_roll_joint", "left_hip_yaw_joint",
        "left_knee_joint", "left_ankle_pitch_joint", "left_ankle_roll_joint",
        "right_hip_pitch_joint", "right_hip_roll_joint", "right_hip_yaw_joint",
        "right_knee_joint", "right_ankle_pitch_joint", "right_ankle_roll_joint",
        "waist_yaw_joint", "waist_roll_joint", "waist_pitch_joint",
        "left_shoulder_pitch_joint", "left_shoulder_roll_joint", "left_shoulder_yaw_joint",
        "left_elbow_joint", "left_wrist_roll_joint", "left_wrist_pitch_joint", "left_wrist_yaw_joint",
        "right_shoulder_pitch_joint", "right_shoulder_roll_joint", "right_shoulder_yaw_joint",
        "right_elbow_joint", "right_wrist_roll_joint", "right_wrist_pitch_joint", "right_wrist_yaw_joint",
    ]
    
    joint_names = [f"{agent}_{s}" for s in G1_ROT_JOINT_SUFFIXES]
    dof_adrs = [env.jnt_dofadr(jn) for jn in joint_names]
    qpos_adrs = [env.jnt_qposadr(jn) for jn in joint_names]
    
    # G1 关节在全局 dof 中的列范围
    v_min, v_max = min(dof_adrs), max(dof_adrs)
    g1_joint_cols = slice(v_min, v_max + 1)
    
    # 关节限位
    jdict = env.model.get_joint_dict()
    jnt_lo = np.array([
        jdict[jn]["Range"][0] if jdict[jn]["Limited"] else -np.inf
        for jn in joint_names
    ])
    jnt_hi = np.array([
        jdict[jn]["Range"][1] if jdict[jn]["Limited"] else np.inf
        for jn in joint_names
    ])
    
    # -- 阶段 1：预设微蹲姿态 --
    # 从伸直状态出发，纯 DLS 可能走反关节方向（膝盖后弯）。
    # 预设膝盖前弯 + 髋前屈 + 踝背屈（补偿使脚底水平）。
    preset = {
        f"{agent}_left_knee_joint": 0.6,
        f"{agent}_left_hip_pitch_joint": -0.3,
        f"{agent}_left_ankle_pitch_joint": -0.3,
        f"{agent}_right_knee_joint": 0.6,
        f"{agent}_right_hip_pitch_joint": -0.3,
        f"{agent}_right_ankle_pitch_joint": -0.3,
    }
    qpos_preset = env.data.qpos.copy()
    for jn, val in preset.items():
        qpos_preset[env.jnt_qposadr(jn)] = val
    env.set_joint_qpos(qpos_preset)
    env.mj_forward()
    
    # -- 阶段 2：IK 迭代 --
    foot_pos = env.get_body_xpos_xmat_xquat([foot_body])[foot_body]["xpos"]
    target = foot_pos + target_offset
    
    jacr = np.zeros((3, env.model.nv))
    for i in range(ITERS):
        jacp_foot = np.zeros((3, env.model.nv))
        env.mj_jacBody(jacp_foot, jacr, body_name=foot_body)
        
        cur = env.get_body_xpos_xmat_xquat([foot_body])[foot_body]["xpos"]
        delta = target - cur
        
        # 阻尼最小二乘
        jac_leg = jacp_foot[:, g1_joint_cols]
        dq = jac_leg.T @ np.linalg.inv(
            jac_leg @ jac_leg.T + DAMPING**2 * np.eye(3)
        ) @ delta
        
        # 合规写入 + 限位 clamp
        qpos = env.data.qpos.copy()
        for j, qadr in enumerate(qpos_adrs):
            qpos[qadr] = np.clip(qpos[qadr] + dq[j] * STEP, jnt_lo[j], jnt_hi[j])
        env.set_joint_qpos(qpos)
        env.mj_forward()
        
        err = np.linalg.norm(delta)
        if err < ATOL:
            print(f"IK 收敛于迭代 {i + 1}，误差 {err:.4f}m")
            break
    
    return env.get_body_xpos_xmat_xquat([foot_body])[foot_body]["xpos"]
```

---

## 参数调优

| 参数 | 作用 | 典型值 | 调优建议 |
|------|------|--------|----------|
| `DAMPING` | 阻尼系数 — 数值稳定性 | 0.01–0.1 | 不收敛时增大；收敛太慢时减小 |
| `STEP` | 每步最大关节变化 — 速度 | 0.02–0.1 | 震荡时减小 |
| `ITERS` | 最大迭代次数 | 50–200 | 根据目标距离调整 |
| `ATOL` | 收敛阈值（m） | 0.01–0.05 | 精度越高越小 |

### 故障排查

| 现象 | 原因 | 解决方案 |
|------|------|----------|
| IK 不收敛 | 阻尼太小或目标太远 | 增大 `DAMPING`，减小目标偏移 |
| 关节反方向弯曲 | 起始姿态不合适 | 预设合理的初始姿态 |
| 误差收敛到非零值 | 关节限位阻挡 | 检查限位是否合理，减小目标 |
| 雅可比全为零 | 未 `mj_forward` | 确保每次 `set_joint_qpos` 后调 `mj_forward()` |
| 多 body 场景 IK 异常 | dof 列范围不对 | 用 `jnt_dofadr` 获取各关节在全局 dof 中的地址 |

---

## 关节限位 clamp

每次 IK 迭代后将关节角 clamp 到限位内，防止生成不可达的姿态：

```python
jdict = env.model.get_joint_dict()
for jn in joint_names:
    lo, hi = jdict[jn]["Range"]       # [lower, upper]
    limited = jdict[jn]["Limited"]    # True/False
```

> **多 body 场景注意**：G1 机器人的关节在全局 dof 数组中的列范围不是 `[7:]`。
> 必须通过 `jnt_dofadr` 获取各关节的实际地址，构造 `[min(dof_adrs), max(dof_adrs)+1]` 作为
> 雅可比子矩阵的列切片。

---

## 与 OrcaGym 内置 InverseKinematicsController 的区别

OrcaGym 还提供了基于 `RobomimicEnv` 的 `InverseKinematicsController`：

| 特性 | 阻尼最小二乘 IK（本页） | InverseKinematicsController |
|------|------------------------|---------------------------|
| 基类 | `OrcaGymEulerEnv` | `RobomimicEnv` |
| 使用方法 | 手动调用 `mj_jacBody` + DLS | `ik.compute_inverse_kinematics()` |
| 灵活性 | 完全可控 | 封装好的黑盒 |
| 适用场景 | Euler 新项目 | Robomimic 兼容项目 |

> **推荐**：新项目使用本页的阻尼最小二乘 IK（Euler API），完全可控且与 Euler 环境
> 的公共 API 一致。

---

## 下一步

掌握了 IK，接下来学习如何**施加外力和写入状态**：[🔄 外力应用与 IK](../physics/force-apply.md)。
