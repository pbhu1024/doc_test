# 🔧 MuJoCo 后端

OrcaGym 的本地模式直接使用 MuJoCo 作为物理引擎。

## 模型加载

模型加载在环境初始化时自动完成，无需手动操作：

```python
# 环境初始化时自动加载模型
env = MyEnv(
    model_xml_path="path/to/scene.xml",
    skip_grpc_load=True,   # 离线模式：从本地文件加载
)
# 内部自动完成: 加载XML → 创建MuJoCo实例 → 构建模型信息 → 同步初始状态
```

## 资源缓存

MuJoCo 模型依赖的 mesh 和 hfield 文件会缓存在 `~/.orcagym/tmp/` 目录。

## 仿真控制

### 步进控制

```python
# 推荐：使用 do_simulation（原子操作，自动同步数据）
env.do_simulation(ctrl, n_frames=20)

# 手动控制（需要自己同步）
env.set_ctrl(ctrl)
env.mj_step(nstep=20)
env._sync_view()           # 同步状态视图

# 前向计算（刷新派生量）
env.mj_forward()

# 纯 MuJoCo 步进
env.mj_step(nstep=20)
```

### ctrl 设置

```python
# 标准方式
ctrl = np.zeros(env.model.nu)
env.set_ctrl(ctrl)
```

## 求解器配置

```python
# 通过 env.sim_config 读写求解器参数
env.sim_config.timestep = 0.002
env.sim_config.iterations = 100
env.sim_config.integrator = 1       # 0=Euler, 1=RK4
env.sim_config.gravity = np.array([0., 0., -9.81])

# 批量设置
env.sim_config.load_from_dict({
    "integrator": 0,
    "iterations": 100,
})

# 导出配置
config = env.sim_config.to_dict()
```

### 关键参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `timestep` | float | 0.002 | 物理步长（秒） |
| `iterations` | int | 100 | 求解器迭代次数 |
| `integrator` | int | 0 | 0=Euler, 1=RK4 |
| `gravity` | ndarray | [0,0,-9.81] | 重力加速度 |
| `tolerance` | float | 1e-8 | 求解器容忍度 |

## 时间步长 vs 控制频率

```
物理步长 (timestep)    = 0.002 秒  # 物理引擎每步的时间
控制步长 (frame_skip)  = 20       # 每次 step() 执行多少物理步
环境步长 (dt)          = 0.04 秒  # timestep × frame_skip
控制频率               = 25 Hz    # 1 / dt
```

```python
print(f"物理步长: {env.sim_config.timestep:.4f}s")
print(f"控制步长: {env.dt:.4f}s")
print(f"控制频率: {1.0/env.dt:.1f}Hz")
```

## 调试与性能分析

```python
# 查看约束计数
counts = env.get_constraint_counts()
print(f"等式约束: {counts.get('nefc', 0)}, 接触: {counts.get('ncon', 0)}")
```
