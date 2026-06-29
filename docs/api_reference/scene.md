# 🎬 Scene API

场景管理接口，位于 `orca_gym/scene/`。

## OrcaGymScene

通过 gRPC 管理 OrcaSim 场景中的 Actor、光源、相机、材质等。

```python
class OrcaGymScene:
    def __init__(self, grpc_addr: str)

    # === 场景发布 ===
    def publish_scene()                                        # 发布当前场景到 OrcaSim

    # === Actor 管理 ===
    def add_actor(actor: Actor)                               # 添加角色到场景

    # === 光源 ===
    def set_light_info(actor_name: str, light_info: LightInfo)

    # === 相机传感器 ===
    def set_camera_sensor_info(actor_name: str, camera_sensor_info: CameraSensorInfo)
    def make_camera_viewport_active(actor_name: str, entity_name: str)

    # === 材质 ===
    def set_material_info(actor_name: str, material_info: MaterialInfo)

    # === 动画参数 ===
    def set_actor_anim_param_number(actor_name: str, param_name: str, value: float)
    def set_actor_anim_param_bool(actor_name: str, param_name: str, value: bool)
    def set_actor_anim_param_string(actor_name: str, param_name: str, value: str)

    # === Lua 脚本参数 ===
    def set_actor_lua_param_string(actor_name: str, param_name: str, value: str)

    # === UI ===
    def set_ui_text(
        self,
        actor_name: int,        # 1-6 对应不同 UI 位置
        message: str = "",
        showtime: int = 0,      # 显示秒数
        blinkfreq: int = 0,     # 闪烁频率
        color: str = "",        # 颜色 (如 "0x00ff00")
        size: int = 0,          # 字号
    )
    def set_image_enabled(actor_name: int, enabled: bool)  # 0=Imagemidlebig, 1=Imagetoplit

    # === 运行数据 ===
    def get_rundata(scriptname: str, stepname: str)

    # === 生命周期 ===
    def close()
```

## OrcaGymSceneRuntime

`OrcaGymScene` 的运行时封装，供 Env 对象持有。仅允许不涉及资源销毁和仿真对象变更的操作。

```python
class OrcaGymSceneRuntime:
    def __init__(self, scene: OrcaGymScene)

    # 允许的操作（运行时安全）
    def set_light_info(actor_name: str, light_info: LightInfo)
    def make_camera_viewport_active(actor_name: str, entity_name: str)
    def set_actor_anim_param_number(actor_name: str, param_name: str, value: float)
    def set_actor_anim_param_bool(actor_name: str, param_name: str, value: bool)
    def set_actor_anim_param_string(actor_name: str, param_name: str, value: str)
```

## 场景元素类型

```python
# 由 orca_gym.scene 导出
class Actor:
    def __init__(
        self,
        name: str,              # Actor 名称（场景内唯一）
        asset_path: str,        # Spawnable 资源路径
        position: np.ndarray,   # 位置 [x, y, z]
        rotation: np.ndarray,   # 四元数 [w, x, y, z] (4,)
        scale: float,           # 缩放
    )

class LightInfo:
    def __init__(
        self,
        color: np.ndarray,      # 颜色 [r, g, b] (3,)
        intensity: float,       # 强度
    )

class CameraSensorInfo:
    def __init__(
        self,
        capture_rgb: bool,
        capture_depth: bool,
        save_mp4_file: bool,
        use_dds: bool,
    )

class MaterialInfo:
    def __init__(
        self,
        base_color: np.ndarray,  # 基础颜色 [r, g, b, a] (4,)
    )
```

## 使用示例

```python
from orca_gym.scene import OrcaGymScene, Actor, LightInfo, CameraSensorInfo

scene = OrcaGymScene("localhost:50051")

# 添加光源 Actor
light_actor = Actor(
    name="my_light",
    asset_path="/lights/spot_light",
    position=np.array([0.0, 0.0, 5.0]),
    rotation=np.array([1.0, 0.0, 0.0, 0.0]),
    scale=1.0,
)
scene.add_actor(light_actor)
scene.publish_scene()

# 设置光源参数
scene.set_light_info("my_light", LightInfo(color=np.array([1.0, 1.0, 1.0]), intensity=2.0))

# 显示 UI 文本
scene.set_ui_text(
    actor_name=1,
    message="训练开始！",
    showtime=5,
    color="0x00ff00",
    size=32,
)

scene.close()
```
