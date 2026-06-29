# 📷 Sensor API

传感器接口，位于 `orca_gym/sensor/`。

## CameraWrapper

```python
class CameraWrapper:
    def __init__(self, name: str, port: int)
    
    # 属性
    name: str                  # 相机名称
    port: int                  # WebSocket 端口
    image: np.ndarray          # 当前图像 (H, W, 3) BGR
    image_index: int           # 帧索引
    enabled: bool              # 是否启用
    received_first_frame: bool # 是否已收到第一帧
    
    # 方法
    def start()                # 启动后台线程
    def is_first_frame_received() -> bool
    
    # 内部
    running: bool
    thread: threading.Thread
```

## 使用示例

```python
from orca_gym.sensor.rgbd_camera import CameraWrapper

camera = CameraWrapper("front_camera", port=8765)
camera.start()

while not camera.is_first_frame_received():
    time.sleep(0.1)

image = camera.image  # 最新帧
print(f"帧 #{camera.image_index}, 形状: {image.shape}")
```

## 传感器数据查询 (Environment 层)

```python
# 通过环境查询 MuJoCo 传感器
env.query_sensor_data(["sensor_name_1", "sensor_name_2"])
# → {"sensor_name_1": array(...), "sensor_name_2": array(...)}
```
