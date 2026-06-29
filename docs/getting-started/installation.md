# 🛠️ 安装指南

OrcaGym 支持多种安装方式，以满足不同场景的需求。

## 环境要求

| 依赖 | 版本要求 |
|------|----------|
| Python | ≥ 3.9 (推荐 3.12) |
| pip | ≥ 21.0 |
| 操作系统 | Ubuntu 20.04+ / Windows 10+ / macOS 12+ |

## 从 PyPI 安装（推荐）

```bash
# 安装核心包
pip install orca-gym

# 或者安装带可选依赖的版本
pip install orca-gym[rl]          # 强化学习训练 (Stable-Baselines3 等)
pip install orca-gym[imitation]   # 模仿学习
pip install orca-gym[devices]     # 输入设备支持
pip install orca-gym[sensors]     # 相机和传感器
pip install orca-gym[all]         # 所有可选依赖
```

## 从源码安装（开发者）

```bash
# 克隆仓库
git clone https://github.com/openverse-orca/OrcaGym.git
cd OrcaGym

# 初始化资源和子模块（如果需要运行示例）
git lfs install
git lfs pull
git submodule update --init --recursive

# 创建 Python 环境（推荐使用 conda）
conda create -n orca python=3.12
conda activate orca

# 安装核心包（可编辑模式）
pip install -e .

# 全量安装
pip install -e ".[all]"

# 按需安装可选依赖
pip install -e ".[rl]"
pip install -e ".[devices]"
pip install -e ".[sensors]"
```

## 依赖说明

### 核心依赖（pip install orca-gym 即包含）

| 包 | 用途 |
|----|------|
| `numpy >= 2.0.0` | 数值计算 |
| `scipy` | 科学计算 |
| `grpcio == 1.66.1` | gRPC 通信框架 |
| `grpcio-tools == 1.66.1` | gRPC 协议工具 |
| `gymnasium >= 1.0.0` | RL 环境标准接口 |
| `mujoco >= 3.3.0` | 物理引擎 |
| `aiofiles` | 异步文件 I/O |

### 可选依赖组

| 组名 | 包含内容 | 适用场景 |
|------|----------|----------|
| `[rl]` | stable-baselines3, torch | RL 训练 |
| `[imitation]` | robomimic 相关 | 模仿学习 |
| `[devices]` | pygame, inputs | 手柄/键盘控制 |
| `[sensors]` | opencv-python, av, websockets | 相机视觉 |

## 配置 OrcaStudio / OrcaLab

下载并安装 [OrcaStudio](http://orca3d.cn/) 或 OrcaLab 以获得：

- 可视化场景编辑
- 远程仿真服务
- 多物理后端支持

## 验证安装

```bash
# 检查导入
python -c "from orca_gym import OrcaGymLocal, OrcaGymModel, OrcaGymData; print('OrcaGym 安装成功!')"

# 检查版本
python -c "import orca_gym; print(orca_gym.__version__)"

# 运行仿真循环（需要 OrcaStudio/OrcaLab 运行中）
orcagym-loop
```

## 常见安装问题

### 问题：MuJoCo 导入失败

```bash
# 确保已安装 mujoco
pip install mujoco>=3.3.0

# Linux 用户可能需要安装额外的系统依赖
sudo apt-get install libglfw3 libglew2.2 libosmesa6
```

### 问题：gRPC 版本冲突

```bash
# 重新安装指定版本
pip install grpcio==1.66.1 grpcio-tools==1.66.1 --force-reinstall
```

### 问题：mesh/hfield 资源下载失败

这是正常现象——mesh 和纹理文件在首次仿真启动时按需下载，确保网络连接正常即可。
