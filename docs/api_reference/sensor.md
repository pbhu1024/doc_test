# 📷 Sensor API

传感器接口，位于 `orca_gym/sensor/`。

## CameraWrapper

通过 WebSocket 接收 OrcaSim 渲染的相机图像。

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
    def start()                                                # 启动后台接收线程
    def stop()                                                 # 停止接收
    def get_frame(format: str = 'bgr24', size: tuple = None) -> tuple[np.ndarray, int]
        # 获取当前帧，format 可选 'bgr24' / 'rgb24'，返回 (frame, index)
    def is_first_frame_received() -> bool
```

## CameraCacher

将相机流保存到本地文件（h264 + 时间戳）。

```python
class CameraCacher:
    def __init__(self, name: str, port: int)
    def start()
    def stop()
    def is_first_frame_received() -> bool
```

## CameraDataParser

解析本地缓存的相机数据。

```python
class CameraDataParser:
    def __init__(self, name: str)
    def get_closed_frame(ts) -> tuple[int, np.ndarray]   # 按时间戳查找最近帧
    def get_frame(index: int) -> np.ndarray              # 按索引获取帧
```

## VideoPlayer

播放本地缓存的 h264 视频。

```python
class VideoPlayer:
    def __init__(self, name: str)
    def play()   # 使用 OpenCV 逐帧播放
```

## Monitor

基于 Matplotlib 的实时相机监控窗口。

```python
class Monitor:
    def __init__(self, name: str, fps: int = 30, port: int = 7070)
    def start()
    def stop()
```

## 使用示例

```python
from orca_gym.sensor.rgbd_camera import CameraWrapper

camera = CameraWrapper("front_camera", port=8765)
camera.start()

while not camera.is_first_frame_received():
    time.sleep(0.1)

frame, index = camera.get_frame(format='rgb24')
print(f"帧 #{index}, 形状: {frame.shape}")

camera.stop()
```

## 传感器数据查询 (Environment 层)

```python
# 通过环境查询 MuJoCo 传感器
env.query_sensor_data(["sensor_name_1", "sensor_name_2"])
# → {"sensor_name_1": array(...), "sensor_name_2": array(...)}
```
