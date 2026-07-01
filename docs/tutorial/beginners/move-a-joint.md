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

## 方法 1：力矩控制（经过物理）⭐ 推荐

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

        # 3. 执行仿真步进（经过物理——do_simulation 自动同步 data）
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

## 方法 2：直接设置关节位置（适合 reset）

直接修改 qpos，然后 `mj_forward()`：

```python
def wiggle_joint(env, joint_index: int = 0, amplitude: float = 0.5, steps: int = 200):
    """
    让指定关节做正弦摆动。

    Args:
        env: 环境实例
        joint_index: qpos 中的关节索引
        amplitude: 摆动幅度（弧度）
        steps: 摆动步数
    """

    print(f"关节 {joint_index} 初始位置: {env.data.qpos[joint_index]:.3f}")

    for i in range(steps):
        # 1. 用正弦波计算目标角度
        target_angle = amplitude * np.sin(i * 0.1)

        # 2. 设置 qpos 和清零速度
        env.data.qpos[joint_index] = target_angle
        env.data.qvel[joint_index] = 0.0

        # 3. mj_forward() 更新所有派生量（body位姿、传感器等）
        env.mj_forward()

        # 4. 渲染
        env.render()
        time.sleep(0.02)

        if i % 20 == 0:
            print(f"  Step {i:3d}: 目标={target_angle:+.3f}, "
                  f"实际={env.data.qpos[joint_index]:+.3f}")

    print(f"关节 {joint_index} 最终位置: {env.data.qpos[joint_index]:.3f}")
```

!!! warning "这个方法不经过物理！"
    `env.data.qpos[joint_index] = target_angle` 是**瞬间设置**位置——不经过力矩、不经过接触力、不考虑质量/惯性。关节会"瞬移"到目标角度。
    
    这在**重置环境**时很有用（快速设定初始姿态），但在正常仿真中应该用**力矩控制**。

---

## 方法 3：set_joint_qpos（按名称设置）

当你知道关节的**名字**（而不是索引），用 `set_joint_qpos` 更方便：

```python
def set_named_joint(env, joint_name: str, target_angle: float):
    """
    按名称设置单个关节的位置。
    """
    # 设置（Euler 体系：全量设置）
    env.set_joint_qpos({
        joint_name: np.array([target_angle]),
    })

    # 必须 forward！
    env.mj_forward()
    env._gym.sync_to_view()   # Euler: 同步 DataView

    # 验证
    actual = env.query_joint_qpos([joint_name])[joint_name]
    print(f"{joint_name}: 目标={target_angle:.3f}, 实际={actual[0]:.3f}")


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

```python
def draw_circle_manual(env, steps: int = 300):
    """手动设置关节位置，让末端大致画一个圆圈"""

    print("让机械臂画圈...")

    for i in range(steps):
        phase = i * 0.05

        # 构造目标关节位置
        target_positions = {}
        for j in range(min(6, env.model.nu)):
            amp = 0.3 if j < 3 else 0.15
            angle = amp * np.sin(phase + j * 0.8)
            joint_name = env.model.joint_id2name(j)
            target_positions[joint_name] = np.array([angle])

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
    from orca_gym.core.orca_gym_local import get_qpos_size
    
    offset = 0
    for i in range(env.model.njnt):
        name = env.model.joint_id2name(i)
        joint_info = env.model.get_joint_byname(name)
        nq = get_qpos_size(joint_info["Type"])
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
