# 🎬 Scene API

场景管理接口，位于 `orca_gym/scene/`。通过 gRPC 管理 OrcaSim 场景中的 Actor、光源、相机、材质等。

## 架构说明

```
OrcaGymScene (完整场景管理)
  └── OrcaGymSceneRuntime (运行时安全子集)
        └── 仅允许不涉及资源销毁和仿真对象变更的操作
```

- **OrcaGymScene**: 完整的场景控制能力，包含添加 Actor、发布场景等重量级操作。适合场景初始化阶段。
- **OrcaGymSceneRuntime**: 运行时安全封装，Env 对象持有。仅允许安全操作（调整光源、切换相机、动画参数等），防止仿真运行中误操作。

---

## OrcaGymScene

位于 `orca_gym/scene/orca_gym_scene.py`。

### 构造

```python
class OrcaGymScene:
    def __init__(self, grpc_addr: str)
```
创建 gRPC aio 通道和 stub（最大消息 1GB）。内部使用 `asyncio.Lock` 保证操作串行。

### 场景发布

```python
def publish_scene()
```
发布当前场景配置到 OrcaSim。在所有 `add_actor()` 调用完成后调用。**注意：调用后 OrcaSim 会重新加载场景，仿真对象会被重建。**

### Actor 管理

```python
def add_actor(actor: Actor)
```
添加一个 Actor 到场景。需在 `publish_scene()` 前调用。失败时打印详细错误信息和排查建议。

### 光源

```python
def set_light_info(actor_name: str, light_info: LightInfo)
```
设置指定 Actor 的光源参数（颜色、强度）。

### 相机传感器

```python
def set_camera_sensor_info(actor_name: str, camera_sensor_info: CameraSensorInfo)
```
设置指定 Actor 的相机参数：RGB/深度捕获、MP4 保存、DDS 格式。

```python
def make_camera_viewport_active(actor_name: str, entity_name: str)
```
激活指定相机 Actor 的视口。

### 材质

```python
def set_material_info(actor_name: str, material_info: MaterialInfo)
```
设置指定 Actor 的材质基础颜色。

### 动画参数

```python
def set_actor_anim_param_number(actor_name: str, param_name: str, value: float)
```
设置 Actor 的数值型动画参数。

```python
def set_actor_anim_param_bool(actor_name: str, param_name: str, value: bool)
```
设置 Actor 的布尔型动画参数。

```python
def set_actor_anim_param_string(actor_name: str, param_name: str, value: str)
```
设置 Actor 的字符串型动画参数。

### Lua 脚本参数

```python
def set_actor_lua_param_string(actor_name: str, param_name: str, value: str)
```
设置 Actor 的 Lua 脚本字符串参数。`set_ui_text` 和 `set_image_enabled` 均通过此方法实现。

### UI 文本

```python
def set_ui_text(
    self,
    actor_name: int,          # 1-6，对应不同 UI 位置
    message: str = "",        # 显示的文本内容
    showtime: int = 0,        # 显示时长（秒）
    blinkfreq: int = 0,       # 闪烁频率
    color: str = "",          # 颜色（如 "0x00ff00"）
    size: int = 0,            # 字号
)
```

actor_name 映射表：

| actor_name | 对应 UI 元素 |
|------------|-------------|
| 1 | SimMessText |
| 2 | SimTipText |
| 3 | SimUpleftText |
| 4 | SimUprightText |
| 5 | SimBottomleft |
| 6 | SimBottomrightText |

### 图片显示控制

```python
def set_image_enabled(actor_name: int, enabled: bool)
```
控制图片 Actor 的显示/隐藏。

| actor_name | 对应 Actor |
|------------|-----------|
| 0 | Imagemidlebig |
| 1 | Imagetoplit |

### 运行数据

```python
def get_rundata(scriptname: str, stepname: str)
```
设置数据收集元信息到 `httpdata` Actor。自动附带操作系统版本。

### 生命周期

```python
def close()
```
关闭 gRPC 通道。

---

## OrcaGymSceneRuntime

位于 `orca_gym/scene/orca_gym_scene_runtime.py`。运行时安全封装，仅允许不影响仿真对象和资源销毁的操作。

### 允许的操作

```python
class OrcaGymSceneRuntime:
    def __init__(self, scene: OrcaGymScene)

    # --- 以下方法均有 try/except 保护，失败时记录日志但不抛出异常 ---

    def set_light_info(actor_name: str, light_info: LightInfo)
    def make_camera_viewport_active(actor_name: str, entity_name: str)
    def set_actor_anim_param_number(actor_name: str, param_name: str, value: float)
    def set_actor_anim_param_bool(actor_name: str, param_name: str, value: bool)
    def set_actor_anim_param_string(actor_name: str, param_name: str, value: str)
```

---

## 场景元素类型

### Actor

场景中的角色/物体。

```python
class Actor:
    def __init__(
        self,
        name: str,              # Actor 名称（场景内唯一）
        asset_path: str,        # Spawnable 资源路径（如 "/robot/arm_6dof"）
        position: np.ndarray,   # 初始位置 [x, y, z]，长度必须为 3
        rotation: np.ndarray,   # 初始旋转，四元数 [w, x, y, z]，长度必须为 4
        scale: float,           # 缩放系数
    )
```

### LightInfo

光源参数。

```python
class LightInfo:
    def __init__(
        self,
        color: np.ndarray,      # 光源颜色 [r, g, b]，长度必须为 3
        intensity: float,       # 光源强度
    )
```

### CameraSensorInfo

相机传感器参数。

```python
class CameraSensorInfo:
    def __init__(
        self,
        capture_rgb: bool,      # 是否捕获 RGB 图像
        capture_depth: bool,    # 是否捕获深度图
        save_mp4_file: bool,    # 是否保存 MP4 视频文件
        use_dds: bool,          # 是否使用 DDS 纹理格式
    )
```

### MaterialInfo

材质参数。

```python
class MaterialInfo:
    def __init__(
        self,
        base_color: np.ndarray,  # 基础颜色 [r, g, b, a]，长度必须为 4
    )
```

---

## 使用示例

### 场景初始化（在 Env 初始化阶段）

```python
from orca_gym.scene import OrcaGymScene, Actor, LightInfo, CameraSensorInfo, MaterialInfo
import numpy as np

# 1. 连接场景
scene = OrcaGymScene("localhost:50051")

# 2. 添加光源 Actor
light_actor = Actor(
    name="main_light",
    asset_path="/lights/spot_light",
    position=np.array([0.0, 0.0, 5.0]),
    rotation=np.array([1.0, 0.0, 0.0, 0.0]),
    scale=1.0,
)
scene.add_actor(light_actor)

# 3. 添加桌子和物体
table = Actor(
    name="table",
    asset_path="/props/table_1",
    position=np.array([0.5, 0.0, 0.0]),
    rotation=np.array([1.0, 0.0, 0.0, 0.0]),
    scale=1.0,
)
scene.add_actor(table)

# 4. 发布场景（在此之后 OrcaSim 开始加载）
scene.publish_scene()

# 5. 配置光源和相机（发布后依然可以设置）
scene.set_light_info("main_light", LightInfo(
    color=np.array([1.0, 1.0, 1.0]),
    intensity=2.5,
))

scene.set_camera_sensor_info("main_camera", CameraSensorInfo(
    capture_rgb=True,
    capture_depth=True,
    save_mp4_file=False,
    use_dds=False,
))

# 6. 显示 UI 提示
scene.set_ui_text(
    actor_name=1,
    message="场景初始化完成！",
    showtime=3,
    color="0x00ff00",
    size=28,
)
```

### 运行时操作（通过 Runtime 封装）

```python
from orca_gym.scene import OrcaGymSceneRuntime, LightInfo

# 在 Env 的 __init__ 中持有 Runtime 实例
runtime = OrcaGymSceneRuntime(scene)

# 运行时调整光源（安全操作，不会影响仿真对象）
runtime.set_light_info("main_light", LightInfo(
    color=np.array([0.8, 0.8, 1.0]),
    intensity=1.5,
))

# 运行时切换相机视口
runtime.make_camera_viewport_active("camera_2", "viewport_1")

# 运行时控制动画参数
runtime.set_actor_anim_param_number("robot_door", "open_angle", 45.0)
runtime.set_actor_anim_param_bool("indicator_light", "is_on", True)
```

### 运行数据采集

```python
# 设置数据采集元信息（脚本名、步骤名），自动附带系统版本
scene.get_rundata(scriptname="my_training_script", stepname="episode_001")
```

### 清理

```python
scene.close()
```
