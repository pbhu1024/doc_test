# 🏗️ Euler 架构设计

理解 `OrcaGymEulerEnv` + `OrcaGymEuler` 的组件设计、API 契约和设计原则。

---

## 设计动机

### 为什么要用新架构

`OrcaGymEulerEnv` + `OrcaGymEuler` 采用 **Facade + 职责内聚分解** 的设计，相比旧架构解决了三个核心问题：

| 问题 | 旧架构表现 | 新架构解法 |
|------|-----------|-----------|
| **上帝类** | 单类承担仿真、Studio、模型注册等所有职责 | 按职责拆分为独立子组件 |
| **API 不完备** | `OrcaGymData` 只缓存 5 个字段，缺 xfrc_applied/cvel/contact | `OrcaGymDataView` 完整只读视图 |
| **封装泄漏** | `_mjModel`/`_mjData` 作为公共属性暴露，83 处直接访问 | 多层隔离，内部对象不可见 |

核心论点：

> **通过完备的公共 API 契约和多层封装隔离机制，引导用户走正确路径，避免直接访问 MuJoCo 内部数据结构。**

---

## 核心设计原则

| 原则 | 含义 |
|------|------|
| **P1 完备性** | 公共 API 覆盖所有合法的 MuJoCo 操作需求，用户无理由绕道 |
| **P2 不暴露引擎内部** | `_mjModel`/`_mjData` 不作为公共属性暴露 |
| **P3 状态一致性契约** | 任何写操作后，`self.data` 保证一致；任何读操作都走 `self.data` |
| **P4 力应用可追踪** | 外力注入通过显式方法，Euler 耦合器可感知 |
| **P5 职责内聚** | 按职责内聚划分模块，一组方法因同一原因变化 |
| **P6 框架无状态、业务自编排** | 框架只提供无状态原语（单次原子读写），业务编排由消费者自行组合实现 |

### P6 详解：无状态原语 vs 业务编排

**无状态原语（框架提供）**：
- 单次调用完成单一数据读写，不依赖前后调用的顺序状态
- 例：`equality_find_slot_by_body(name)`、`equality_constraint(slot)`、`equality_update(slot, **fields)`

**业务编排（你来实现）**：
- 编排多个原语完成有语义意图的流程（如"绑定"/"释放"/"抓取"）
- 持有跨调用的业务状态（如快照、绑定标记）
- 例：bind_mocap = find_slot + read_constraint + align_mocap + update_constraint

> 业务状态归你管理，比框架代管更易审查、更不易诱导误用。

---

## 整体结构

```
gym.Env
  └── OrcaGymEulerEnv                    (Facade，直接继承 gym.Env)
        │   ↑ OrcaGymEnvMixin（名称空间、空间生成、reset 编排）
        │
        │   组合（非继承）
        ├── _gym: OrcaGymEuler           (仿真核心 Facade)
        │     ├── _sim: MuJoCoSimCore    # 持有 _mjModel/_mjData（不对外暴露）
        │     ├── _studio: OrcaStudioBridge  # gRPC 集成
        │     ├── _registry: ModelRegistry  # 模型信息
        │     ├── _opt: SimConfig        # 求解器配置（typed）
        │     └── _euler: EulerOrchestrator | None  # Euler 耦合
        │
        │   公共 API（你面向的）
        ├── .data → OrcaGymDataView      # 完整状态视图
        ├── .model → OrcaGymModel        # 模型结构
        ├── .sim_config → SimConfig      # 求解器配置
        └── .ctrl → np.ndarray           # 控制数组
```

### 与旧架构的对比

| 维度 | 旧架构 (OrcaGymLocalEnv) | 新架构 (OrcaGymEulerEnv) |
|------|-------------------------|-------------------------|
| 类结构 | 上帝类，单类承担所有职责 | Facade + 职责内聚分解 |
| `_mjModel`/`_mjData` | 公共属性，直接暴露 | 内部组件，多层隔离 |
| 状态视图 | 5 字段缓存，不完整 | `OrcaGymDataView` 完整只读视图 |
| 求解器配置 | 无接口，绕道 `opt.*` | `SimConfig` typed 配置 |
| 外力注入 | 直接写 `xfrc_applied` | `apply_body_force()` 显式方法 |
| 继承体系 | 继承自腐化的 `OrcaGymBase` 链 | 直接继承 `gym.Env` + `OrcaGymEnvMixin` |

---

## 组件一览

### OrcaGymEulerEnv — 环境 Facade

你直接使用的环境类。作为 Gymnasium `Env` 的实现，组合 `OrcaGymEuler` 仿真核心，暴露统一 API。

**关键属性**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `data` | `OrcaGymDataView` | 完整状态只读视图 |
| `model` | `OrcaGymModel` | 模型结构信息 |
| `sim_config` | `SimConfig` | 求解器参数配置 |
| `ctrl` | `np.ndarray` | 控制数组 |
| `frame_skip` | `int` | 每次 `step()` 的物理步进数 |
| `dt` | `float` | 单步物理时间 |

### OrcaGymEuler — 仿真核心 Facade

组合仿真子组件，向 `OrcaGymEulerEnv` 提供仿真操作接口。**不暴露** `_mjModel`/`_mjData`。

### MuJoCoSimCore — 仿真核心

持有 `_mjModel`/`_mjData`，执行 `mj_step`/`mj_forward`/`set_ctrl` 等纯 MuJoCo 操作。这两个对象**只存在于此类内部**，不对外暴露。

### OrcaStudioBridge — Studio 集成

处理与 OrcaStudio 的 gRPC 交互（渲染、视频保存、物体操作）。与仿真核心解耦——不持有 `_mjData`，通过接收数据参数工作。

### ModelRegistry — 模型注册

构建 `OrcaGymModel`/`OrcaGymDataView`，提供 `query_all_*` 等模型信息查询。

### SimConfig — 求解器配置

提供 typed 的 MuJoCo 求解器参数读写接口，替代 `_mjModel.opt.*` 直接访问。

```python
# ✅ 新方式
env.sim_config.timestep = 0.002
env.sim_config.iterations = 100
env.sim_config.load_from_dict({"integrator": 0, "iterations": 100})

# ❌ 旧方式（不要这样做）
env._gym._sim._mjModel.opt.timestep = 0.002
```

### OrcaGymDataView — 完整状态视图

MuJoCo 状态的完整只读视图。覆盖所有你需要读取的字段，通过方法按名称查询 body/site/geom。

```python
data = env.data

# 基本状态
data.qpos        # (nq,) 广义坐标
data.qvel        # (nv,) 广义速度
data.qacc        # (nv,) 广义加速度
data.time        # 仿真时间

# 扩展字段
data.xfrc_applied       # 外力（只读，写入用 apply_body_force）
data.actuator_force     # 执行器力
data.contact            # 接触列表

# 按名称查询
data.body_xpos("link1")        # (3,) 世界坐标
data.body_xquat("link1")       # (4,) 四元数 [w,x,y,z]
data.body_cvel("link1")        # (6,) 速度 [ang(3), lin(3)]
data.site_xpos("imu")          # (3,)
data.body_subtree_mass("link1") # float
```

### EulerOrchestrator — Euler 耦合（占位）

编排 Euler 非刚体求解器与 MuJoCo 刚体求解器的耦合步进。当前阶段为 `None`，`OrcaGymEulerEnv` 表现为纯 MuJoCo 环境。

---

## API 契约

### 契约层级

| 层级 | 含义 | 你可以 |
|------|------|--------|
| **L1 公共 API** | 暴露的方法和属性 | 自由使用 |
| **L2 内部组件** | `_gym`/`_sim`/`_studio` 等 | 不应访问 |
| **L3 引擎内部** | `_mjModel`/`_mjData` | 绝不应访问 |

### 状态读取（规则 R1–R3）

```python
# ✅ 正确
qpos = env.data.qpos
body_pos = env.data.body_xpos("link1")

# ❌ 错误（违反 R1：不要穿透到内部对象）
qpos = env._gym._sim._mjData.qpos
```

- `env.data` 在 `do_simulation()` 返回后保证一致
- `env.data` 是只读视图，写入必须通过显式方法

### 状态写入（规则 W1–W3）

```python
# ✅ 正确
env.set_joint_qpos({"joint1": np.array([0.5])})
env.apply_body_force("link1", force, torque)
env.mj_forward()

# ❌ 错误（违反 W1/W2：不要直接写内部数据结构）
env._gym._sim._mjData.xfrc_applied[body_id, :3] = force
```

### 仿真步进（规则 S1–S4）

| 方法 | 职责 | Euler 耦合 | 适用场景 |
|------|------|-----------|---------|
| `do_simulation(ctrl, n)` | 标准步进 | 有（未来） | 大多数 Env 的 `step()` |
| `mj_step(n)` | 纯 MuJoCo 步进 | 无 | 需要精细控制时序时 |
| `mj_forward()` | 前向计算 | 无 | 状态设置后更新派生量 |

**模式 A（推荐）**：

```python
def step(self, action):
    torque = self._compute_torque(action)
    self.do_simulation(torque, self.frame_skip)  # 含 Euler 耦合
    return self._get_obs(), reward, terminated, truncated, info
```

**模式 B（纯 MuJoCo，无耦合）**：

```python
def step(self, action):
    for _ in range(self.frame_skip):
        torque = self._compute_torque(action)
        self.set_ctrl(torque)
        self.mj_step(nstep=1)
    return self._get_obs(), reward, terminated, truncated, info
```

### 求解器配置（规则 C1–C2）

```python
# ✅ 正确
env.sim_config.timestep = 0.002
env.sim_config.iterations = 100
env.sim_config.load_from_dict({"integrator": 0, "iterations": 100})

# ❌ 错误（违反 C1）
env._gym._sim._mjModel.opt.timestep = 0.002
```

配置修改在下次 `mj_step` 时生效。

---

## 完整公共 API 清单

| 类别 | API |
|------|-----|
| **状态读取** | `data`（OrcaGymDataView）, `model`（OrcaGymModel）, `ctrl`, `frame_skip`, `dt` |
| **仿真控制** | `do_simulation(ctrl, n)`, `mj_step(n)`, `mj_forward()` |
| **状态查询** | `query_joint_qpos/qvel/qacc/offsets/lengths()`, `query_site_pos_and_quat/mat/xvalp_xvalr()`, `query_actuator_torques()`, `query_sensor_data()`, `query_contact_simple()`, `get_body_xpos_xmat_xquat()` |
| **状态设置** | `set_joint_qpos/qvel()`, `set_mocap_pos_and_quat()`, `set_geom_friction()`, `apply_body_force()`, `clear_body_force()`, `clear_all_forces()` |
| **等式约束原语** | `equality_find_slot_by_body(body_name)`, `equality_constraint(slot)`, `equality_update(slot, **fields)` |
| **求解器配置** | `sim_config`（SimConfig） |
| **名称空间** | `joint()`, `body()`, `site()`, `actuator()`, `sensor()` |
| **Studio 交互** | `render()`, `begin_save_video()`, `stop_save_video()`, `get_current_frame()`, `get_frame_png()` |
| **生命周期** | `initialize_simulation()`, `initialize_grpc()`, `pause_simulation()`, `close()` |

---

## 迁移速查：旧代码 → 新 API

如果你正在从 `OrcaGymLocalEnv` 迁移，以下是常见替换：

### 状态读取

| 旧代码 | 新 API |
|--------|--------|
| `gym._mjData.qpos` | `env.data.qpos` |
| `gym._mjData.qvel` | `env.data.qvel` |
| `gym._mjData.body(id).xpos` | `env.data.body_xpos(name)` |
| `gym._mjData.cvel[id]` | `env.data.body_cvel(name)` |
| `gym._mjData.xpos[body_id, 2]` | `env.data.body_xpos(name)[2]` |
| `gym._mjData.time` | `env.data.time` |

### 状态写入

| 旧代码 | 新 API |
|--------|--------|
| `gym._mjData.xfrc_applied[id, :3] = f` | `env.apply_body_force(name, f, tau)` |
| `gym._mjData.xfrc_applied[id].fill(0)` | `env.clear_body_force(name)` |
| `gym._mjData.eq_active[gi] = bool` | `env.equality_update(slot, active=bool)` |

### 求解器配置

| 旧代码 | 新 API |
|--------|--------|
| `gym._mjModel.opt.timestep = 0.002` | `env.sim_config.timestep = 0.002` |
| `gym._mjModel.opt.iterations = 100` | `env.sim_config.iterations = 100` |
| `gym._mjModel.opt.integrator = 0` | `env.sim_config.integrator = 0` |
| `gym._mjModel.opt.gravity = ...` | `env.sim_config.gravity = ...` |
| 多行 `opt.*` 设置 | `env.sim_config.load_from_dict({...})` |

### 模型结构查询

| 旧代码 | 新 API |
|--------|--------|
| `gym._mjModel.body_subtreemass[id]` | `env.model.body_subtree_mass(name)` |
| `gym._mjModel.eq_data.shape[1]` | `env.model.equality_data_width()` |
| `gym._mjModel.eq_obj1id[gi]` | `env.model.equality_object_ids(idx)` |

---

## 封装与隔离

新架构通过多层机制让"正确方式"成为阻力最小的路径：

| 机制 | 效果 |
|------|------|
| **Python 原生属性不存在** | `env.gym` / `env.stub` / `env.channel` 直接抛 `AttributeError` |
| **ruff SLF001 静态检查** | 提交前/CI 阶段检测穿墙访问（如 `env._gym._sim`） |
| **`__dir__` 控制** | IDE 自动补全只显示公共 API |
| **DataView 兜底** | 缺字段时引导扩展而非绕道 |
| **docstring 契约** | 类文档明确列出正确用法和禁止事项 |

### 新旧架构隔离强度对比

| 系统 | 绕道路径 | 层数 | IDE 可见性 | 静态检查 |
|------|---------|------|-----------|---------|
| 旧架构 | `env.gym._mjData` | 2 | `gym` 在补全列表中 | 无 |
| 新架构 | `env._gym._sim._mjData` | 3 | 不在 `__dir__` 中 | ruff SLF001 报警 |

---

## 阅读顺序

1. [Model / Data / Config](model-data-opt.md) — 理解三种核心数据对象
2. [Gymnasium 接口](gym-interface.md) — 理解标准 RL 接口
3. [数据流](data-flow.md) — 理解数据如何在仿真中流动
4. [系统架构](architecture.md) — 理解整体分层设计
5. 本文 — 理解组件设计和 API 契约的完整细节
