# 🔧 MuJoCo 后端

OrcaGym 的本地模式直接使用 MuJoCo 作为物理引擎。

## 模型加载

```python
# OrcaGymLocal 通过 gRPC 获取 XML 后本地加载
model_xml_path = await gym.load_model_xml()
await gym.init_simulation(model_xml_path)

# init_simulation 内部：
#   1. mujoco.MjModel.from_xml_path(model_xml_path)
#   2. mujoco.MjData(self._mjModel)
#   3. 构造 OrcaGymModel, OrcaGymData, OrcaGymOptConfig
#   4. 查询并填充所有 body/joint/actuator/geom/site/sensor 信息
```

## 资源缓存

MuJoCo 模型依赖的 mesh 和 hfield 文件会缓存在 `~/.orcagym/tmp/`：

```python
# 缓存目录
print(env.gym.xml_file_dir)  # ~/.orcagym/tmp/

# 文件在首次加载时自动下载
# 使用文件锁避免多进程冲突
# 使用原子写入避免文件损坏
```

## Opt 配置

### 查询配置

```python
opt_config = env.gym.query_opt_config()
# 返回字典，包含所有 opt 参数
```

### 修改配置

```python
# 单一字段
env.gym.set_time_step(0.002)  # 修改本地 timestep

# 从 OrcaGymOptConfig 批量写入
env.gym.opt.timestep = 0.002
env.gym.set_opt_config()  # 将 self.opt 全部写入 _mjModel.opt

# 同步到远程服务器
await env.gym.set_timestep_remote(0.002)
```

### 关键 Opt 字段

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

## 仿真控制

### 步进控制

```python
# 推进 nstep 次物理步
env.gym.mj_step(nstep=20)

# 前向计算（刷新派生量）
env.gym.mj_forward()

# 逆动力学（计算实现特定加速度所需的力）
env.gym.mj_inverse()
```

### ctrl 设置

```python
# 标准方式
ctrl = np.zeros(env.model.nu)
env.gym.set_ctrl(ctrl)

# 如果有 UI 覆盖，对应维度会被覆盖
# env.gym._override_ctrls = {actuator_id: value}
```

## 执行器配置

### 禁用执行器组

```python
# 按组禁用执行器
env.gym.disable_actuator([0, 2])  # 禁用组 0 和组 2
```

### 修改执行器目标

```python
# 修改执行器驱动的目标关节
env.gym.set_actuator_trnid(actuator_id=0, trnid=3)
```

## 动力学接口

```python
# 质量矩阵
M = env.gym.mj_fullM()  # (nv, nv)

# Body 雅可比
jacp = np.zeros((3, env.model.nv))
jacr = np.zeros((3, env.model.nv))
body_id = env.model.body_name2id("ee_link")
env.gym.mj_jacBody(jacp, jacr, body_id)

# Site 雅可比
site_id = env.model.site_name2id("gripper_site")
env.gym.mj_jacSite(jacp, jacr, site_id)

# 在 site 点施加力
env.gym.mj_apply_force_at_site(
    site_name="gripper_site",
    force=np.array([0.0, 0.0, 5.0]),    # [fx, fy, fz]
    torque=np.array([0.0, 0.0, 0.0])    # [tx, ty, tz]
)
```
