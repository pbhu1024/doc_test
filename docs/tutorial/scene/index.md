# 🎬 场景管理

OrcaGym 的场景系统提供了对仿真场景的运行时控制。

## 场景对象

场景由以下元素构成：

- **Actor** — 场景中的角色/物体
- **Light** — 光源
- **Camera** — 相机（含 RGB-D 传感器信息）
- **Material** — 材质

```python
from orca_scene import OrcaGymScene, OrcaGymSceneRuntime
```

## 章节导航

- [🏞️ 场景加载](scene-loading.md)
- [🎭 物体操作](actor-manipulation.md)
- [🏔️ 地形生成](terrain-generation.md)
- [🎨 资源与渲染](assets-rendering.md)
