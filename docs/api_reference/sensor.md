# 📷 Sensor API

传感器接口，位于 `orca_gym/sensor/`。提供相机图像接收、缓存、解析、回放等功能。

## 类概览

| 类 | 说明 |
|----|------|
| `CameraWrapper` | 通过 WebSocket 实时接收 OrcaSim 渲染的相机图像 |
| `CameraCacher` | 将相机流保存到本地文件（H.264 + 时间戳） |
| `CameraDataParser` | 解析本地缓存的相机数据（按时间戳/索引查找帧） |
| `VideoPlayer` | 使用 OpenCV 逐帧回放本地缓存的 H.264 视频 |
| `Monitor` | 基于 Matplotlib 的实时相机监控窗口 |

---

## CameraWrapper

位于 `orca_gym/sensor/rgbd_camera.py`。通过 WebSocket 连接 OrcaSim 接收实时相机图像。使用后台线程异步接收，主线程通过 `get_frame()` 非阻塞获取。

### 构造

```python
class CameraWrapper:
    def __init__(self, name: str, port: int)
```
- `name`: 相机名称
- `port`: WebSocket 端口号

### 属性

```python
name: str                       # 相机名称
port: int                       # WebSocket 端口
image: np.ndarray               # 当前图像 (H, W, 3)，BGR 格式
image_index: int                # 当前帧索引（自增）
enabled: bool                   # 是否启用（默认 True）
received_first_frame: bool      # 是否已收到第一帧
```

### 生命周期

```python
def start()
```
启动后台接收线程。线程在 WebSocket 连接上循环接收并解码 H.264 帧。

```python
def stop()
```
停止接收，设置 `running=False`。

### 帧获取

```python
def get_frame(format: str = 'bgr24', size: tuple | None = None) -> tuple[np.ndarray, int]
```
获取当前帧和帧索引。

- `format`: `'bgr24'`（默认）或 `'rgb24'`（通过 cv2 颜色转换）
- `size`: 可选的目标尺寸 `(width, height)`，通过 cv2.resize 调整
- 返回值: `(frame, image_index)`

```python
def is_first_frame_received() -> bool
```
是否已收到第一帧。用于等待相机开始推送。

### 使用示例

```python
from orca_gym.sensor.rgbd_camera import CameraWrapper
import time

camera = CameraWrapper("front_camera", port=8765)
camera.start()

# 等待第一帧到达
while not camera.is_first_frame_received():
    time.sleep(0.1)

print(f"开始接收帧，形状: {camera.image.shape}")

# 循环获取帧
for i in range(100):
    frame, idx = camera.get_frame(format='rgb24', size=(224, 224))
    print(f"帧 #{idx}, 形状: {frame.shape}")

camera.stop()
```

---

## CameraCacher

位于 `orca_gym/sensor/rgbd_camera.py`。将 WebSocket 相机流保存为本地文件，包含 H.264 视频和二进制时间戳。

### 构造

```python
class CameraCacher:
    def __init__(self, name: str, port: int)
```
- `name`: 相机名称（用于生成文件名 `{name}_video.h264` 和 `{name}_ts.bin`）
- `port`: WebSocket 端口

### 生命周期

```python
def start()
```
启动后台接收线程，将前 8 字节作为时间戳写入 `{name}_ts.bin`，剩余数据写入 `{name}_video.h264`。

```python
def stop()
```
停止接收。

```python
def is_first_frame_received() -> bool
```
是否已收到第一帧。

---

## CameraDataParser

位于 `orca_gym/sensor/rgbd_camera.py`。解析 CameraCacher 保存的离线数据。

### 构造

```python
class CameraDataParser:
    def __init__(self, name: str)
```
加载 `{name}_ts.bin` 和 `{name}_video.h264`。

### 帧查找

```python
def get_closed_frame(ts: int) -> tuple[int, np.ndarray]
```
按时间戳二分查找最近的帧。返回 `(frame_index, frame_array)`。

```python
def get_frame(index: int) -> np.ndarray
```
按索引获取指定的帧（H.264 解码为 BGR ndarray）。连续读取同一索引会走缓存。

### 内部优化

- 时间戳列表有序存储，使用二分查找定位
- `get_frame()` 缓存上一次解码结果，避免重复解码

---

## VideoPlayer

位于 `orca_gym/sensor/rgbd_camera.py`。用 OpenCV 逐帧播放快取到本地的 H.264 视频。

### 构造

```python
class VideoPlayer:
    def __init__(self, name: str)
```
加载 `{name}_video.h264`。

### 播放

```python
def play()
```
用 OpenCV 逐帧播放视频。按 `q` 键退出。

---

## Monitor

位于 `orca_gym/sensor/rgbd_camera.py`。基于 Matplotlib 的实时相机监控窗口。

### 构造

```python
class Monitor:
    def __init__(self, name: str, fps: int = 30, port: int = 7070)
```
内部创建 `CameraWrapper` 实例，用 Matplotlib 动画实时显示相机画面。

### 生命周期

```python
def start()
```
启动 Matplotlib 动画显示窗口（会阻塞当前线程直到关闭窗口）。

```python
def stop()
```
停止动画，释放相机资源。

---

## 完整使用流程示例

### 实时监控

```python
from orca_gym.sensor.rgbd_camera import Monitor

# 打开实时监控窗口
monitor = Monitor("my_camera", fps=30, port=8765)
monitor.start()  # 会阻塞直到关闭窗口
```

### 离线缓存 + 按需读取

```python
from orca_gym.sensor.rgbd_camera import CameraCacher, CameraDataParser, VideoPlayer

# === 采集阶段 ===
cacher = CameraCacher("my_dataset", port=8765)
cacher.start()

# ... 运行仿真，等待数据写入 ...

cacher.stop()

# === 解析阶段 ===
parser = CameraDataParser("my_dataset")

# 按时间戳查找最近帧
ts = 1234567890
index, frame = parser.get_closed_frame(ts)
print(f"时间戳 {ts} 对应帧 #{index}")

# 按索引获取指定帧
frame_100 = parser.get_frame(100)

# === 回放阶段 ===
player = VideoPlayer("my_dataset")
player.play()
```

---

## 传感器数据查询（Environment 层）

Environment 层提供了直接查询 MuJoCo 传感器（加速度计、陀螺仪、触觉等）的接口，与相机传感器是不同体系：

```python
# 通过 OrcaGymLocalEnv 查询 MuJoCo 传感器数据
sensor_data = env.query_sensor_data(["imu_accelerometer", "imu_gyro", "touch_left_finger"])
# 返回: {"imu_accelerometer": array(3,), "imu_gyro": array(3,), "touch_left_finger": array(1,)}
```

MuJoCo 传感器类型包括：
- `accelerometer`: 加速度计（线性加速度）
- `gyro`: 陀螺仪（角速度）
- `touch`: 触觉传感器（接触力）
- `velocimeter`: 速度计（线性速度）
- `framequat`: 框架姿态（四元数）
