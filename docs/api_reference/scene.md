# 🎬 Scene API

场景管理接口，位于 `orca_gym/scene/`。

## OrcaGymScene

```python
class OrcaGymScene:
    def __init__(self, orcagym_address: str)
    
    def get_rundata(script_name: str, stage: str)
    def set_ui_text(actor_name, message, showtime, color, size)
    def close()
```

## OrcaGymSceneRuntime

```python
class OrcaGymSceneRuntime:
    def __init__(...)
    # 场景运行时管理
```

## 场景元素类型

```python
# 由 orca_gym.scene 导出
Actor              # 场景角色
LightInfo          # 光源信息
CameraSensorInfo   # 相机传感器信息
MaterialInfo       # 材质信息
```

## 使用示例

```python
from orca_gym.scene import OrcaGymScene

scene = OrcaGymScene("localhost:50051")

# 获取运行数据
scene.get_rundata("my_script", "beginscene")

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
