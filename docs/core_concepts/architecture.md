# 🧩 系统架构

了解 OrcaGym 的整体架构，帮助你理解各组件之间的关系。

## 分层架构

OrcaGym 采用分层设计，每层有明确的职责和 API 边界：

```
┌─────────────────────────────────────────────────────────────────┐
│  用户代码 (User Code)                                            │
│  业务环境子类、任务定义、奖励函数、观测构造                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │ 继承 OrcaGymEulerEnv，使用 env.data / env.sim_config
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  RL 训练框架 (RSL-RL / SB3)                                      │
│  策略训练、rollout 调度、obs / action / reward 流转               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ env.reset() / env.step() / env.do_simulation()
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  环境层：OrcaGymEulerEnv                                         │
│  gym.Env 实现、公共 API 契约、OrcaGymEnvMixin                    │
│  .data / .model / .sim_config / .apply_body_force() / .query_*()│
└───────────────────────────┬─────────────────────────────────────┘
                            │ 组合（非继承），委托到 _gym
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  仿真核心层：OrcaGymEuler (Facade)                               │
│  MuJoCoSimCore / OrcaStudioBridge / ModelRegistry /             │
│  SimConfig / EulerOrchestrator                                  │
└──────┬─────────────────────────────────────────────┬────────────┘
       │                                             │
       │ mj_step / mj_forward                        │ gRPC 通信
       ▼                                             ▼
┌─────────────────────────────────┐  ┌─────────────────────────────┐
│  MuJoCo Runtime (刚体求解器)     │  │  OrcaStudio 系统             │
│  MjModel / MjData / mj_step     │  │  渲染、场景同步、视频保存      │
│  opt.* 求解器参数                │  │  物体操纵、相机控制            │
└─────────────────────────────────┘  └─────────────────────────────┘
       │
       │ 外力耦合 / 同步周期
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  引擎层：Euler Runtime                                           │
│  多物理场仿真、Model / State / Control、求解器调度、零拷贝耦合     │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  框架层：OrcaFlow                                                │
│  GPU 编程框架、多后端编译                                         │
└─────────────────────────────────────────────────────────────────┘
```

| 层次 | 项目 | 职责 |
|------|------|------|
| 用户代码 | 业务仓库 | 业务环境子类、奖励函数、观测构造 |
| RL 训练框架 | RSL-RL / SB3 | 策略训练、rollout 调度 |
| 环境层 | OrcaGym | gym.Env 实现、公共 API 契约 |
| 仿真核心层 | OrcaGym | 仿真核心 Facade + 子组件编排 |
| 刚体运行时 | MuJoCo | 刚体动力学求解 |
| 非刚体运行时 | Euler | 多物理场仿真、求解器调度 |
| Studio 系统 | OrcaStudio | 渲染、场景同步、交互（旁路系统） |
| 框架层 | OrcaFlow | GPU 编程框架、多后端编译 |

> **OrcaStudio 是旁路系统**：通过 gRPC 与仿真核心通信，不参与 `mj_step` 主路径，不影响物理仿真。Studio 缺席时环境仍可正常 step。

---

## 两大运行模式

### 本地模式

```
Python 代码 ──(内存方法调用)──▶ MuJoCo（进程中直接运行）
```

MuJoCo 引擎在 Python 同一进程中直接运行，性能最高，适合开发和调试。

```python
# 离线模式 —— 不需要 OrcaStudio
env = MyEnv(
    frame_skip=5,
    orcagym_addr="localhost:50051",
    agent_names=["agent0"],
    time_step=0.002,
    model_xml_path="path/to/model.xml",
    skip_grpc_load=True,           # 离线模式
)
```

### 远程模式

```
Python 代码 ──(网络)──▶ OrcaSim Server
                         ├── 物理计算 (MuJoCo/PhysX/ODE)
                         ├── 渲染
                         └── 场景管理
```

Python 客户端发送控制指令，服务端执行物理计算并返回状态。适合大规模分布式训练。

### 模式选择

| 场景 | 推荐模式 | 原因 |
|------|----------|------|
| 开发调试 | 本地 | MuJoCo 直连，没有网络延迟 |
| 单机训练 | 本地 + 向量化 | 多进程并行 |
| 大规模分布式 | 远程 | 仿真在服务端，训练在客户端 |
| 需要 PhysX 后端 | 远程 | PhysX 仅在服务端可用 |

---

## 环境类层次

```
gymnasium.Env
  └── OrcaGymEulerEnv         # 👈 推荐：当前主路径
        ├── .data → 状态只读视图 (OrcaGymDataView)
        ├── .model → 模型结构信息 (OrcaGymModel)
        ├── .sim_config → 求解器配置 (SimConfig)
        └── .ctrl → 当前控制输入 (np.ndarray)
```

---

## API 层次

### 用户开发层 — 你应该使用的 API

用户代码仅与以下 API 交互，**不要穿透到内部对象**：

| API | 来源 | 用途 |
|-----|------|------|
| `env.data` | `OrcaGymDataView` | 读取 `qpos`/`qvel`/`body_xpos(name)` 等状态 |
| `env.model` | `OrcaGymModel` | 查询模型结构（维度、名称映射） |
| `env.sim_config` | `SimConfig` | 配置 timestep / integrator / iterations / gravity |
| `env.ctrl` | `np.ndarray` | 设置控制输入 |
| `env.do_simulation(ctrl, n)` | — | 仿真步进 |
| `env.set_joint_qpos()` / `env.apply_body_force()` | — | 状态写入、外力注入 |
| `env.body()` / `env.joint()` / `env.actuator()` / `env.site()` | `OrcaGymEnvMixin` | 名称空间解析（自动添加 agent 前缀） |
| `env.render()` / `env.begin_save_video()` | — | Studio 交互 |
| `gym.Env` 标准接口 | Gymnasium | `reset()` / `step()` / `observation_space` / `action_space` |

**典型用户代码**：

```python
class MyTaskEnv(OrcaGymEulerEnv):
    def _get_obs(self) -> dict:
        # ✅ 走公共 API
        return {
            "qpos": self.data.qpos.copy(),
            "body_pos": self.data.body_xpos("link1"),
        }

    def compute_reward(self) -> float:
        # ✅ 走公共 API
        return float(self.data.body_xpos("target")[2])

    def _apply_disturbance(self):
        # ✅ 走公共 API
        self.apply_body_force("link1", force=[0, 0, 10], torque=[0, 0, 0])
```

---

## 封装边界

```
用户可见（公共 API）           │  用户不可见（内部实现）
──────────────────────────────┼──────────────────────────────────
env.data (OrcaGymDataView)    │  env._gym
env.model (OrcaGymModel)      │  env._gym._sim
env.sim_config (SimConfig)    │  env._gym._sim._mjModel / _mjData
env.ctrl                      │  env._gym._studio
env.do_simulation()           │  env._gym._registry
env.apply_body_force()        │  env._gym._euler
env.query_*()                 │  env._gym._opt
env.body() / joint() / ...    │
```

- **左列**：公共 API，你应当使用，IDE 自动补全可见
- **右列**：内部组件，`_` 前缀约定，禁止外部访问

---

## 关键调用流

### step 主路径

```
用户代码 / RL 框架
    │ env.step(action)  或  env.do_simulation(ctrl, n_frames)
    ▼
OrcaGymEulerEnv
    │ 委托 _gym.do_simulation()
    ▼
OrcaGymEuler
    │ _sim.set_ctrl() → _sim.step(nstep)
    ▼
MuJoCoSimCore
    │ mj_step × nstep
    ▼
MuJoCo Runtime  ←── (EulerOrchestrator 启用时) ── Euler Runtime / OrcaFlow
    │
    │ _sim.sync_to_view()
    ▼
OrcaGymDataView  ←── env.data 读取一致
```

### 渲染旁路

```
用户代码
    │ env.render()
    ▼
OrcaGymEulerEnv
    │ 委托 _studio.render(qpos, sim_time)
    ▼
OrcaStudioBridge  ──gRPC──▶  OrcaStudio 系统（独立进程/机器）
                                    │ 场景同步、渲染、视频帧捕获
```

渲染路径与物理步进路径**完全解耦**：Studio 仅消费 `qpos`/`sim_time` 快照，不触碰 `mj_step`。

### 状态写入与外力注入

```
用户代码
    │ env.apply_body_force(name, force, torque)
    ▼
OrcaGymEulerEnv
    │ 委托 _gym.apply_body_force()
    ▼
OrcaGymEuler
    │ _sim.apply_body_force(body_id, force, torque)
    │ (可选) _euler.notify_external_force(...)
    ▼
MuJoCoSimCore
    │ 写入 xfrc_applied（内部细节，对用户不可见）
```

---

## 关键设计理念

1. **标准接口优先**：Gymnasium 接口是第一公民
2. **状态一致性**：`do_simulation()` 返回后 `env.data` 自动同步
3. **按名称访问**：通过 body/joint/site 名称而非 ID 访问，代码更可读
4. **安全写入**：通过公共方法修改状态，确保数据一致
5. **封装隔离**：内部 MuJoCo 对象不对外暴露，引导走正确路径

---

## 阅读顺序建议

详见 [Euler 架构设计](euler-architecture.md) 了解组件设计、API 契约和设计原则的完整说明。
