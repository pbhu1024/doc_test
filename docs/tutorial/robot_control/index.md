# 🎮 机器人控制

OrcaGym 提供丰富的机器人控制接口，从底层的关节控制到高层的逆运动学。

## 控制层级

```
高层 API
  ├── InverseKinematicsController  ── 末端位姿 → 关节位置
  ├── JointController              ── 目标位置 → 控制力矩
  └── Mocap Control               ── 直接设置 mocap 位姿

底层 API
  ├── set_ctrl()                   ── 设置执行器控制值
  ├── set_joint_qpos()             ── 设置关节位置
  └── mj_apply_force_at_site()     ── 施加外力
```

## 章节导航

- [🎯 动作空间](action-space.md)
- [👁️ 观测空间](observation-space.md)
- [🦾 逆运动学](inverse-kinematics.md)
- [🦿 关节控制](joint-control.md)
- [🎭 Mocap 控制](mocap-control.md)
