# 🧩 系统架构

OrcaGym 的整体架构设计。

## 分层架构

```
┌──────────────────────────────────────────────────┐
│                   RL Algorithm                   │
│            (Stable-Baselines3 / RLlib / ...)     │
├──────────────────────────────────────────────────┤
│              Gymnasium Env Interface             │
│     (OrcaGymEulerEnv [推荐] / OrcaGymLocalEnv)    │
├──────────────────────────────────────────────────┤
│                  OrcaGym Core                    │
│   ┌──────────────────┬──────────────────────┐   │
│   │  Euler 体系（新）    │  Local 体系（老）       │   │
│   │  OrcaGymEuler      │  OrcaGymLocal        │   │
│   │  ├─ MuJoCoSimCore  │  ├─ _mjModel (暴露)   │   │
│   │  ├─ SimConfig      │  ├─ _mjData (暴露)    │   │
│   │  ├─ DataView       │  ├─ OrcaGymModel      │   │
│   │  ├─ ModelRegistry  │  ├─ OrcaGymData       │   │
│   │  └─ StudioBridge   │  └─ OrcaGymOptConfig  │   │
│   └──────────────────┴──────────────────────┘   │
├──────────────────────────────────────────────────┤
│                  gRPC Layer                      │
│   (mjc_message.proto → grpc.aio channel)         │
├──────────────────────────────────────────────────┤
│              OrcaSim Simulation Server           │
│   ┌──────────┬──────────┬──────────┬──────────┐  │
│   │ MuJoCo   │ PhysX    │ ODE      │ Render   │  │
│   │ Engine   │ Engine   │ Engine   │ Engine   │  │
│   └──────────┴──────────┴──────────┴──────────┘  │
└──────────────────────────────────────────────────┘
```

## 两套环境体系

OrcaGym 当前包含**两套环境体系**，长期共存、逐步迁移：

| 体系 | 环境类 | Backend 类 | 状态 |
|------|--------|-----------|------|
| **Euler（新主路径）** | `OrcaGymEulerEnv` | `OrcaGymEuler` | ✅ 推荐新项目使用 |
| **Local（老路径）** | `OrcaGymLocalEnv` | `OrcaGymLocal` | 维护模式，逐步废弃 |

### Euler 体系（推荐）

```
gym.Env
  └── OrcaGymEulerEnv                     (Facade + 契约执行者)
        │   ↑ OrcaGymEnvMixin（名称空间、空间生成、reset 编排）
        │
        ├── _gym: OrcaGymEuler           (仿真核心 Facade，内部对象)
        │     ├── _sim: MuJoCoSimCore    # _mjModel/_mjData 唯一存放位置
        │     ├── _studio: OrcaStudioBridge  # gRPC 集成（依赖反转）
        │     ├── _registry: ModelRegistry   # 模型注册与结构查询
        │     ├── _opt: SimConfig        # 求解器配置（typed）
        │     └── _euler: EulerOrchestrator | None  # Euler 耦合（占位）
        │
        │   公共 API（用户面向）
        ├── .data → OrcaGymDataView      # 完整状态只读视图
        ├── .model → OrcaGymModel        # 模型结构（两套体系共用）
        ├── .sim_config → SimConfig      # 求解器配置
        └── .ctrl → np.ndarray           # 控制数组
```

Euler 体系遵循五大设计原则：

| 原则 | 含义 | 对比 Local 体系 |
|------|------|----------------|
| **P1 完备性** | 公共 API 覆盖所有合法 MuJoCo 操作 | 大量缺口迫使绕道 `_mjData` |
| **P2 不暴露引擎内部** | `_mjModel`/`_mjData` 不作为公共属性 | 直接暴露，83 处绕道访问 |
| **P3 状态一致性契约** | 写操作后 `self.data` 保证一致 | `data` 与 `_mjData` 双轨制 |
| **P4 力应用可追踪** | 外力注入通过 `apply_body_force()` | 直接写 `xfrc_applied` |
| **P5 职责内聚** | Facade 模式 + 组合优于继承 | 上帝类 |

**关键 API 差异：**

| 操作 | Euler 体系 ✅ | Local 体系 ⚠️ |
|------|-------------|-------------|
| 读取状态 | `env.data.qpos` | `env.gym._mjData.qpos` |
| 设置求解器 | `env.sim_config.timestep = 0.002` | `env.gym._mjModel.opt.timestep = 0.002` |
| 施加外力 | `env.apply_body_force(name, f, tau)` | 直接写 `xfrc_applied` |
| 访问 backend | `env._gym`（内部，不对外） | `env.gym`（公共属性） |

> ⚠️ `env.gym`/`env.stub`/`env.channel` 在 `OrcaGymEulerEnv` 中**不存在**（Python 原生 `AttributeError`）。

### Local 体系（老路径，维护模式）

```
gym.Env
  └── OrcaGymBaseEnv
        └── OrcaGymLocalEnv
              ├── gym: OrcaGymLocal     # 公共属性
              │     ├── _mjModel         # ⚠️ 直接暴露
              │     ├── _mjData          # ⚠️ 直接暴露
              │     ├── model: OrcaGymModel
              │     ├── data: OrcaGymData（仅 5 字段）
              │     └── opt: OrcaGymOptConfig
              ├── model → gym.model
              └── data → gym.data
```

## 两大运行模式

### 本地模式 (Local Mode)

```
Python 代码 ──(内存方法调用)──▶ MuJoCo（进程中直接运行）
```

MuJoCo 引擎在 Python 同一进程中直接运行，性能最高，适合开发和调试。

```python
# Euler 体系（推荐）—— 离线模式
env = OrcaGymEulerEnv(
    frame_skip=5,
    orcagym_addr="localhost:50051",
    agent_names=["agent0"],
    time_step=0.001,
    model_xml_path="path/to/model.xml",
    skip_grpc_load=True,           # 离线模式：跳过 gRPC
)

# Local 体系（老路径）—— 本地模式
env = gym.make("Task-v0",
    orcagym_addr="localhost:50051",
    ...
)
# env.gym 是 OrcaGymLocal 实例
```

### 远程模式 (Remote Mode)

```
Python 代码 ──(gRPC)──▶ OrcaSim Server
                         ├── 物理计算 (MuJoCo/PhysX/ODE)
                         ├── 渲染
                         └── 场景管理
```

Python 客户端发送控制指令，服务端执行物理计算并返回状态。适合大规模分布式训练。

## gRPC 通信架构

```
Python Client                   OrcaSim Server
┌────────────────────────┐   gRPC   ┌─────────────────────────┐
│ GrpcServiceStub        │◄────────►│ GrpcServiceServicer     │
├────────────────────────┤          ├─────────────────────────┤
│ OrcaGymEuler / Local   │          │ 仿真引擎                 │
│ OrcaGymEulerEnv        │          │ 场景管理                 │
└────────────────────────┘          └─────────────────────────┘
```

### 关键 gRPC 调用

| 方法 | 方向 | 说明 |
|------|------|------|
| `LoadLocalEnv` | Client → Server | 请求模型 XML 文件 |
| `LoadContentFile` | Client → Server | 请求 mesh/hfield 资源 |
| `UpdateLocalEnv` | Client → Server | 发送状态用于渲染 |
| `PauseSimulation` | Client → Server | 暂停仿真循环 |
| `BeginSaveMp4File` | Client → Server | 开始视频录制 |

### 消息格式（Protobuf）

```
orca_gym/protos/mjc_message.proto
  ├── LoadLocalEnvRequest/Response
  ├── LoadContentFileRequest/Response
  ├── UpdateLocalEnvRequest/Response
  ├── PauseSimulationRequest/Response
  └── ...
```

使用 `mjc_message_pb2` 和 `mjc_message_pb2_grpc` 模块。

## 模块依赖

```
environment/
  ├── euler/
  │     └── orca_gym_euler_env.py   (OrcaGymEulerEnv — 新主路径)
  ├── orca_gym_env_mixin.py         (OrcaGymEnvMixin — 两套共用)
  ├── orca_gym_env.py               (OrcaGymBaseEnv — 老体系)
  └── orca_gym_local_env.py         (OrcaGymLocalEnv — 老体系)

core/
  ├── euler/                        (Euler 体系)
  │     ├── orca_gym_euler.py       (OrcaGymEuler — Facade)
  │     ├── mujoco_sim_core.py      (MuJoCoSimCore)
  │     ├── sim_config.py           (SimConfig)
  │     ├── orca_gym_data_view.py   (OrcaGymDataView)
  │     ├── model_registry.py       (ModelRegistry)
  │     └── orca_studio_bridge.py   (OrcaStudioBridge)
  ├── orca_gym_model.py             (OrcaGymModel — 两套共用)
  ├── orca_gym_data.py              (OrcaGymData — 老体系)
  ├── orca_gym_opt_config.py        (OrcaGymOptConfig — 老体系)
  ├── orca_gym.py                   (OrcaGymBase — 老体系)
  └── orca_gym_local.py             (OrcaGymLocal — 老体系)
```

## 设计原则

1. **P1 完备性**：公共 API 覆盖所有合法的 MuJoCo 操作需求，用户无理由绕道
2. **P2 不暴露引擎内部**：`_mjModel`/`_mjData` 不对外暴露，多层封装隔离
3. **P3 状态一致性契约**：写操作后 `self.data` 保证一致
4. **P4 力应用可追踪**：外力注入通过显式方法 `apply_body_force()`
5. **P5 职责内聚**：Facade 模式 + 组合优于继承，按职责划分模块
6. **标准接口优于内部实现**：Gymnasium 接口是第一公民
7. **异步原生支持**：gRPC 使用 aio 通道，环境使用 asyncio 事件循环
