# 🔌 Hello World — 跑通第一个仿真

目标：5 分钟内连接仿真服务器，运行一个最简仿真循环。

---

## 前提

- 已安装 OrcaGym（`pip install orca-gym`）
- **OrcaStudio / OrcaLab 正在运行**，默认监听 `localhost:50051`

---

## 完整代码

下面是一个**可以直接运行**的最简示例。把它保存为 `hello_orcagym.py`：

```python
"""
hello_orcagym.py — OrcaGym 最简示例

功能：连接仿真 → 跑 100 步 → 关闭
前提：OrcaStudio/OrcaLab 正在运行
"""

import gymnasium as gym
import numpy as np

# ============================================================
# 第 1 步：注册环境
# ============================================================
# 告诉 gym："HelloOrcaGym-v0" 这个名字对应哪个类、什么参数

gym.register(
    id="HelloOrcaGym-v0",
    entry_point="orca_gym.scripts.sim_env:SimEnv",  # 用内置的示例环境
    kwargs={
        'frame_skip': 20,             # 每次 step() 推 20 个物理步
        'orcagym_addr': "localhost:50051",
        'agent_names': ["robot_0"],
        'time_step': 0.001,           # 每个物理步 0.001 秒
    },
    max_episode_steps=1000,
)

# ============================================================
# 第 2 步：创建环境 & 运行
# ============================================================
print("正在连接仿真服务器...")
env = gym.make("HelloOrcaGym-v0")
print(f"✅ 连接成功！nu(执行器数)={env.model.nu}, dt={env.dt:.4f}s")

# 重置到初始状态
obs, info = env.reset()

# 跑 100 步
for i in range(100):
    # 动作 = 全零（不做任何控制，让机器人自由落体/保持静止）
    action = np.zeros(env.model.nu, dtype=np.float32)

    # step() 做三件事：施加动作 → 物理仿真 → 更新状态
    obs, reward, terminated, truncated, info = env.step(action)

    # 渲染到 OrcaStudio 窗口
    env.render()

    if i % 20 == 0:
        print(f"  Step {i:3d}: qpos[0]={env.data.qpos[0]:.4f}")

print("✅ 完成！")
env.close()
```

运行：

```bash
python hello_orcagym.py
```

---

## 逐行解释

### 环境注册

```python
gym.register(
    id="HelloOrcaGym-v0",                              # 给环境起个名字
    entry_point="orca_gym.scripts.sim_env:SimEnv",     # "模块路径:类名"
    kwargs={...},                                       # 传给 __init__ 的参数
    max_episode_steps=1000,                            # 最多跑 1000 步
)
```

`gym.register` 就像一个"电话簿"，告诉 gym 用什么类、什么参数来创建环境。

### 创建环境

```python
env = gym.make("HelloOrcaGym-v0")
```

`gym.make` 内部会自动完成：
1. 建立 gRPC 连接到仿真服务器
2. 下载模型 XML
3. 初始化本地 MuJoCo 物理引擎
4. 创建 `model`（静态结构）和 `data`（动态状态）

### 核心循环

```python
obs, info = env.reset()                              # 回到初始状态
obs, reward, terminated, truncated, info = env.step(action)  # 前进一步
env.render()                                          # 更新画面
```

| 变量 | 含义 |
|------|------|
| `obs` | 观测数据（关节角度、速度等） |
| `reward` | 奖励（这里恒为 0） |
| `terminated` | 任务是否完成/失败 |
| `truncated` | 是否超时截断 |
| `info` | 额外调试信息 |

---

## 常见问题

### `grpc._channel._InactiveRpcError`

**原因**：OrcaStudio/OrcaLab 没有运行。

**检查**：
```bash
nc -zv localhost 50051  # 应该显示 "succeeded"
```

### mesh 下载失败

首次运行时 mesh 文件会按需下载，属于正常现象。确保网络通畅，等几秒即可。

---

## 下一步

你已经跑通了最简仿真！接下来学习如何**往场景里放东西**：[🎬 场景搭建](scene-setup.md)。
