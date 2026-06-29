# 🦾 让机器人动起来 — 控制单个关节

前面我们只是"看"，这一节开始**让机器人动起来**。我们从最简单的开始：理解 `qpos`/`qvel`，手动控制一个关节。

---

## 核心概念：qpos 和 qvel

MuJoCo 用两个数组描述整个仿真世界的位置和速度：

```
qpos = [关节0角度, 关节1角度, ..., 关节N角度, 物体X, 物体Y, 物体Z, 物体qw, 物体qx, 物体qy, 物体qz]
       └────── 机器人关节 ──────┘  └────────── 自由物体位姿 ──────────┘

qvel = [关节0角速度, 关节1角速度, ..., 物体Vx, 物体Vy, 物体Vz, 物体ωx, 物体ωy, 物体ωz]
```

- `qpos` 的长度 = `env.model.nq`（广义坐标数）
- `qvel` 的长度 = `env.model.nv`（自由度数量）

---

## 方法 1：直接设置关节位置

最直接的方式：直接修改 `qpos`，然后 `mj_forward()`。

```python
"""
move_single_joint.py — 手动驱动一个关节来回摆动
"""

import numpy as np
import time

def wiggle_joint(env, joint_index: int = 0, amplitude: float = 0.5, steps: int = 200):
    """
    让指定关节做正弦摆动。

    Args:
        env: OrcaGymLocalEnv 实例
        joint_index: qpos 中的关节索引（通常是 0）
        amplitude: 摆动幅度（弧度）
        steps: 摆动步数
    """

    print(f"关节 {joint_index} 初始位置: {env.data.qpos[joint_index]:.3f}")

    for i in range(steps):
        # 1. 用正弦波计算目标角度
        target_angle = amplitude * np.sin(i * 0.1)

        # 2. 直接设置 qpos 中对应关节的位置
        env.data.qpos[joint_index] = target_angle

        # 3. 清零该关节的速度（让它在目标位置停下来）
        env.data.qvel[joint_index] = 0.0

        # 4. mj_forward() 让 MuJoCo 更新所有派生量（body位姿、传感器等）
        env.mj_forward()

        # 5. 渲染
        env.render()
        time.sleep(0.02)  # 减速到 ~50Hz，方便观察

        if i % 20 == 0:
            print(f"  Step {i:3d}: 目标={target_angle:+.3f}, "
                  f"实际={env.data.qpos[joint_index]:+.3f}")

    print(f"关节 {joint_index} 最终位置: {env.data.qpos[joint_index]:.3f}")
```

!!! warning "这个方法不经过物理！"
    `env.data.qpos[joint_index] = target_angle` 是**瞬间设置**位置——不经过力矩、不经过接触力、不考虑质量/惯性。关节会"瞬移"到目标角度。
    
    这在**重置环境**时很有用（快速设定初始姿态），但在正常仿真中应该用**力矩控制**。

---

## 方法 2：力矩控制（经过物理）

真正的物理仿真应该用**力矩驱动**关节：

```python
def torque_drive_joint(env, joint_index: int = 0, steps: int = 200):
    """
    用恒定力矩驱动一个关节，观察它在重力+惯性下的运动。

    这展示了"经过物理"的控制方式：
    力矩 → 加速度 → 速度 → 位置（而不是直接设置位置）
    """

    # 获取力矩范围
    ctrlrange = env.model.get_actuator_ctrlrange()
    max_torque = ctrlrange[joint_index, 1]  # 该关节的最大力矩

    print(f"关节 {joint_index} 力矩范围: [{ctrlrange[joint_index, 0]:.1f}, {max_torque:.1f}] N·m")

    for i in range(steps):
        # 1. 构造力矩数组 —— 只有指定的关节有非零力矩
        ctrl = np.zeros(env.model.nu, dtype=np.float64)

        # 2. 前半段正向力矩，后半段反向
        if i < steps // 2:
            ctrl[joint_index] = 0.3 * max_torque   # 30% 正向力矩
        else:
            ctrl[joint_index] = -0.3 * max_torque  # 30% 反向力矩

        # 3. 执行仿真步进（_经过物理_）
        env.do_simulation(ctrl, env.frame_skip)

        # 4. 渲染
        env.render()

        if i % 20 == 0:
            pos = env.data.qpos[joint_index]
            vel = env.data.qvel[joint_index]
            print(f"  Step {i:3d}: pos={pos:+.4f} rad, vel={vel:+.4f} rad/s, "
                  f"torque={ctrl[joint_index]:+.2f} N·m")
```

---

## 方法 3：set_joint_qpos（针对命名关节）

当你知道关节的**名字**（而不是索引），用 `set_joint_qpos` 更方便：

```python
def set_named_joint(env, joint_name: str, target_angle: float):
    """
    按名称设置单个关节的位置。

    这个方法内部会找到关节在 qpos 中的地址并修改对应值。
    """
    # 设置
    env.set_joint_qpos({
        joint_name: np.array([target_angle]),
    })

    # 必须 forward！
    env.mj_forward()
    env.gym.update_data()

    # 验证
    actual = env.query_joint_qpos([joint_name])[joint_name]
    print(f"{joint_name}: 目标={target_angle:.3f}, 实际={actual:.3f}")


# 用法
set_named_joint(env, "robot_0_joint1", 0.5)
```

同样，也可以设置速度：

```python
env.set_joint_qvel({
    "robot_0_joint1": np.array([0.1]),  # 0.1 弧度/秒
})
env.mj_forward()
```

---

## 完整示例：让机械臂画圆

组合上面的知识，让机械臂末端在空中画一个圈：

```python
"""
draw_circle.py — 逐关节驱动，让机械臂末端画圆
（纯手动控制，不使用 IK）
"""

import numpy as np
import time

def draw_circle_manual(env, steps: int = 300):
    """
    手动设置关节位置，让末端大致画一个圆圈。

    原理：
    - 假设机械臂有 6-7 个旋转关节
    - 给前两个关节正弦波，制造圆弧运动
    - 这不是精确的末端画圆，但能直观展示关节控制
    """

    print("让机械臂画圈...")

    for i in range(steps):
        phase = i * 0.05  # 控制速度

        # 构造目标关节位置（每个关节独立的正弦波）
        target_positions = {}
        for j in range(min(6, env.model.nu)):
            # 每个关节不同的相位和幅度
            amp = 0.3 if j < 3 else 0.15
            angle = amp * np.sin(phase + j * 0.8)
            joint_name = env.model.joint_id2name(j)
            target_positions[joint_name] = np.array([angle])

        # 设置所有关节位置
        env.set_joint_qpos(target_positions)
        env.mj_forward()
        env.render()
        time.sleep(0.02)

    print("完成！")
```

---

## 理解 qpos 的布局

不同关节类型在 `qpos` 中占用的元素数量不同：

| 关节类型 | qpos 元素数 | 含义 |
|----------|------------|------|
| `hinge`（旋转） | 1 | 旋转角度（弧度） |
| `slide`（滑动） | 1 | 滑动距离（米） |
| `ball`（球） | 4 | 四元数 [w, x, y, z] |
| `free`（自由） | 7 | [x, y, z, qw, qx, qy, qz] |

```python
def print_qpos_layout(env):
    """打印 qpos 数组中每个关节的位置"""
    offset = 0
    for i in range(env.model.njnt):  # njnt = 关节总数
        name = env.model.joint_id2name(i)
        nq = env.model.get_joint(name)["JointNq"]  # 这个关节占几个 qpos 元素
        print(f"qpos[{offset:2d}:{offset+nq:2d}]  {name}  (nq={nq})")
        offset += nq
```

---

## 安全提示

- 设置过大的关节角度可能导致**自碰撞**（机械臂打到自己）
- 设置过大的力矩可能导致仿真**不稳定**（数值爆炸）
- 建议先用小幅度（±0.5 弧度以内）测试
- 仿真中损坏没有后果——大胆试！

---

## 下一步

你已经能让关节动起来了。接下来学习**如何获取相机图像**：[📷 相机与视觉](camera-and-vision.md)。
