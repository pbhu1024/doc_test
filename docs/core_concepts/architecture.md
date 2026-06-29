# 🧩 系统架构

OrcaGym 的整体架构设计。

## 分层架构

```
┌──────────────────────────────────────────────────┐
│                   RL Algorithm                     │
│            (Stable-Baselines3 / RLlib / ...)       │
├──────────────────────────────────────────────────┤
│              Gymnasium Env Interface               │
│          (OrcaGymBaseEnv / OrcaGymLocalEnv)        │
├──────────────────────────────────────────────────┤
│                  OrcaGym Core                      │
│   ┌──────────┬──────────┬──────────┬──────────┐   │
│   │ Model    │ Data     │ Opt      │ Local    │   │
│   │ (静态信息) │ (动态状态) │ (物理配置) │ (本地后端) │   │
│   └──────────┴──────────┴──────────┴──────────┘   │
├──────────────────────────────────────────────────┤
│                  gRPC Layer                        │
│   (mjc_message.proto → grpc.aio channel)          │
├──────────────────────────────────────────────────┤
│              OrcaSim Simulation Server              │
│   ┌──────────┬──────────┬──────────┬──────────┐   │
│   │ MuJoCo   │ PhysX    │ ODE      │ Render   │   │
│   │ Engine   │ Engine   │ Engine   │ Engine   │   │
│   └──────────┴──────────┴──────────┴──────────┘   │
└──────────────────────────────────────────────────┘
```

## 两大运行模式

### 本地模式 (Local Mode)

```
Python 代码 ──(内存方法调用)──▶ OrcaGymLocal
                                   ├── mujoco.MjModel
                                   ├── mujoco.MjData
                                   └── mujoco.mj_step()
```

MuJoCo 引擎在 Python 同一进程中直接运行，性能最高，适合开发和调试。

```python
# 本地模式 —— MuJoCo 直接在进程中
env = gym.make("Task-v0",
    orcagym_addr="localhost:50051",  # 仍需要 gRPC 获取模型
    ...
)
# env.gym 是 OrcaGymLocal 实例
# env.gym._mjModel / env.gym._mjData 是原生 MuJoCo 对象
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
┌──────────────┐   gRPC      ┌─────────────────┐
│ GrpcServiceStub│◄──────────▶│ GrpcServiceServicer│
├──────────────┤              ├─────────────────┤
│ OrcaGymLocal  │              │ 仿真引擎         │
│ OrcaGymBaseEnv│              │ 场景管理         │
└──────────────┘              └─────────────────┘
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
  └── core/
       ├── orca_gym_model.py     (OrcaGymModel)
       ├── orca_gym_data.py      (OrcaGymData)
       ├── orca_gym_opt_config.py(OrcaGymOptConfig)
       ├── orca_gym.py           (OrcaGymBase)
       └── orca_gym_local.py     (OrcaGymLocal)
            ├── mujoco           (Python 绑定)
            └── protos           (gRPC 生成)
```

## 设计原则

1. **关注点分离**：Model（静态）和 Data（动态）严格分离
2. **标准接口优于内部实现**：Gymnasium 接口是第一公民
3. **封装底层复杂性**：`OrcaGymLocal` 封装 MuJoCo API 细节
4. **异步原生支持**：gRPC 使用 aio 通道，环境使用 asyncio 事件循环
