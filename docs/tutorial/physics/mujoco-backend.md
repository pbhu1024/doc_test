# 🔧 MuJoCo 后端

OrcaGym 的本地模式直接使用 MuJoCo 作为物理引擎。

## 模型加载

```python
# Euler 体系 — 加载在初始化时自动完成
# Env.__init__ → initialize_simulation()
#   → _gym.load_model_xml() [在线: gRPC; 离线: 本地路径]
#   → _gym.init_simulation(xml_path)
#       → MuJoCoSimCore.init_simulation()  # 创建 _mjModel/_mjData
#       → ModelRegistry.build_orca_gym_model()
#       → SimConfig._bind(mj_model)
#       → sync_to_view()

# Local 体系（老）— 手动两步
model_xml_path = await gym.load_model_xml()
await gym.init_simulation(model_xml_path)
```

## 资源缓存

MuJoCo 模型依赖的 mesh 和 hfield 文件会缓存在 `~/.orcagym/tmp/`：

```python
# Euler 体系 — 通过 studio bridge 离线配置
env._studio_bridge.configure_offline(xml_path)

# Local 体系（老）
print(env.gym.xml_file_dir)  # ~/.orcagym/tmp/
```

## 仿真控制

### 步进控制

```python
# 推荐：使用 do_simulation（原子操作，自动同步数据）
env.do_simulation(ctrl, n_frames=20)

# 手动控制（需要自己同步）
env.set_ctrl(ctrl)
env.mj_step(nstep=20)
env._gym.sync_to_view()    # Euler: 同步 DataView

# 前向计算（刷新派生量）
env.mj_forward()

# 纯 MuJoCo 步进（无 Euler 耦合）
env.mj_step(nstep=20)
```

### ctrl 设置

```python
# 标准方式
ctrl = np.zeros(env.model.nu)
env.set_ctrl(ctrl)

# 如果有 UI 覆盖，对应维度会被覆盖
# （内部：Gym.set_ctrl 从 Bridge.get_override_ctrls 取覆盖值）
```

## 求解器配置

### Euler 体系 — SimConfig

```python
# 通过 env.sim_config 读写（替代直接访问 _mjModel.opt.*）
env.sim_config.timestep = 0.002
env.sim_config.iterations = 100
env.sim_config.integrator = 1       # 0=Euler, 1=RK4
env.sim_config.gravity = np.array([0., 0., -9.81])

# 批量设置
env.sim_config.load_from_dict({
    "integrator": 0,
    "iterations": 100,
})

# 导出
config = env.sim_config.to_dict()
```

### Local 体系（老）— OrcaGymOptConfig

```python
# 单个字段
env.gym.set_time_step(0.002)

# 批量写入
env.gym.opt.timestep = 0.002
env.gym.set_opt_config()  # opt → _mjModel.opt

# 同步到远程服务器
await env.gym.set_timestep_remote(0.002)
```

### 关键参数

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `timestep` | 0.001 | 单步时间（秒） |
| `gravity` | [0, 0, -9.81] | 重力向量 |
| `solver` | Newton | 求解器类型 |
| `iterations` | 100 | 迭代次数 |
| `integrator` | Euler | 积分器类型 |
| `cone` | Pyramidal | 摩擦锥类型 |
| `o_margin` | 0.0 | 接触边距 |
| `o_solref` | [0.02, 1] | 接触求解器参数 |
| `o_friction` | [1, 1, 0] | 摩擦参数 |

## 动力学接口

```python
# 雅可比（Euler — 按名称，Local — 按 id）
jacp = np.zeros((3, env.model.nv))
jacr = np.zeros((3, env.model.nv))

# Body 雅可比
env.mj_jacBody(jacp, jacr, "ee_link")          # Euler: 按名称
env.mj_jacBody(jacp, jacr, body_id)            # Local: 按 id

# Site 雅可比
env.mj_jacSite(jacp, jacr, "gripper_site")     # Euler: 按名称

# 批量 site 雅可比
jac_dict = env.mj_jac_site(["site1", "site2"])

# 在 site 点施加力
env.mj_apply_force_at_site(
    site_name="gripper_site",
    force=np.array([0.0, 0.0, 5.0]),     # [fx, fy, fz] 世界系
    torque=np.array([0.0, 0.0, 0.0])     # [tx, ty, tz] 世界系
)

# 对 body 直接施加力（Euler 体系推荐）
env.apply_body_force("torso_link",
    force=np.array([0., 0., 100.]),
    torque=np.array([0., 0., 0.]),
)
env.clear_body_force("torso_link")
env.clear_all_forces()
```

## 执行器配置

```python
# 按组禁用执行器（Euler — 通过 _gym）
env._gym.disable_actuator([0, 2])
# Local（老）
env.gym.disable_actuator([0, 2])
```
